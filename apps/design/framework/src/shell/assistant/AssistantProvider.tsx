import { useMemo, useRef, type ReactNode } from 'react'
import { streamText } from 'ai'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
} from '@assistant-ui/react'
import { AssistantAvailabilityProvider } from './availability'
import { AssistantPageSessionProvider } from './pageSession'
import {
  createStreamTextAdapter,
  type AdapterContext,
} from './streamTextAdapter'

const adapter = createStreamTextAdapter({
  streamTextImpl: (opts) =>
    streamText(opts as Parameters<typeof streamText>[0]) as unknown as {
      fullStream: AsyncIterable<Record<string, unknown>>
  },
})

function createAbortError(): Error {
  const error = new Error('Tool execution was aborted.')
  error.name = 'AbortError'
  return error
}

function executeWithAbortRace<T>(
  execute: () => T | Promise<T>,
  signals: readonly AbortSignal[],
  isCurrent: () => boolean,
): Promise<T> {
  const uniqueSignals = signals.filter(
    (signal, index) => signals.indexOf(signal) === index,
  )
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      for (const signal of uniqueSignals) {
        signal.removeEventListener('abort', onAbort)
      }
    }
    const resolveOnce = (value: T) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const rejectOnce = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const isStale = () =>
      !isCurrent() || uniqueSignals.some((signal) => signal.aborted)
    const onAbort = () => rejectOnce(createAbortError())

    if (isStale()) {
      rejectOnce(createAbortError())
      return
    }
    for (const signal of uniqueSignals) {
      signal.addEventListener('abort', onAbort, { once: true })
    }
    Promise.resolve()
      .then(() => {
        if (isStale()) throw createAbortError()
        return execute()
      })
      .then(resolveOnce, rejectOnce)
  })
}

export function createPageScopedModelAdapter(
  runAdapter: ReturnType<typeof createStreamTextAdapter>,
  getEpoch: () => number,
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal, context, unstable_getMessage }) {
      const epoch = getEpoch()
      const currentMessage = unstable_getMessage()
      const hasCompletedTool = currentMessage.content.some(
        (part) => part.type === 'tool-call' && part.result !== undefined,
      )
      const adapterContext = context as unknown as AdapterContext
      const guardedContext: AdapterContext = {
        ...adapterContext,
        ...(adapterContext.tools
          ? {
              tools: Object.fromEntries(
                Object.entries(adapterContext.tools).map(([name, tool]) => {
                  if (!tool.execute) return [name, tool]
                  const execute = tool.execute
                  return [name, {
                    ...tool,
                    execute: (args, toolContext) =>
                      executeWithAbortRace(
                        () => execute(args, {
                          ...toolContext,
                          abortSignal,
                        }),
                        [abortSignal, toolContext.abortSignal],
                        () => getEpoch() === epoch,
                      ),
                  }]
                }),
              ),
            }
          : {}),
      }
      try {
        for await (const chunk of runAdapter.run({
          messages: messages as never,
          abortSignal,
          context: guardedContext,
          currentMessage: hasCompletedTool
            ? (currentMessage as never)
            : undefined,
        })) {
          if (abortSignal.aborted || getEpoch() !== epoch) return
          yield chunk as unknown as ChatModelRunResult
        }
      } catch (error) {
        if (abortSignal.aborted || getEpoch() !== epoch) return
        throw error
      }
    },
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const epochRef = useRef(0)
  const modelAdapter = useMemo(
    () => createPageScopedModelAdapter(adapter, () => epochRef.current),
    [],
  )
  const runtime = useLocalRuntime(modelAdapter, { maxSteps: 2 })
  return (
    <AssistantAvailabilityProvider>
      <AssistantPageSessionProvider runtime={runtime} epochRef={epochRef}>
        <AssistantRuntimeProvider runtime={runtime}>
          {children}
        </AssistantRuntimeProvider>
      </AssistantPageSessionProvider>
    </AssistantAvailabilityProvider>
  )
}

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
import { createStreamTextAdapter } from './streamTextAdapter'
import {
  AssistantModelModeProvider,
  createDelegatingChatModelAdapter,
  useModelModeApi,
} from './modelAdapterMode'

const streamTextAdapter = createStreamTextAdapter({
  streamTextImpl: (opts) =>
    streamText(opts as Parameters<typeof streamText>[0]) as unknown as {
      fullStream: AsyncIterable<Record<string, unknown>>
  },
})
const adapter: ChatModelAdapter = {
  run(options) {
    return streamTextAdapter.run(
      options as unknown as Parameters<typeof streamTextAdapter.run>[0],
    ) as unknown as AsyncGenerator<ChatModelRunResult, void>
  },
}

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
  runAdapter:
    | ReturnType<typeof createStreamTextAdapter>
    | ChatModelAdapter,
  getEpoch: () => number,
): ChatModelAdapter {
  return {
    async *run(options) {
      const {
        abortSignal,
        context,
        unstable_getMessage,
      } = options
      const epoch = getEpoch()
      const currentMessage = unstable_getMessage()
      const hasCompletedTool = currentMessage.content.some(
        (part) => part.type === 'tool-call' && part.result !== undefined,
      )
      const guardedContext = {
        ...context,
        ...(context.tools
          ? {
              tools: Object.fromEntries(
                Object.entries(context.tools).map(([name, tool]) => {
                  if (!tool.execute) return [name, tool]
                  const execute = tool.execute
                  return [name, {
                    ...tool,
                    execute: (
                      args: Parameters<typeof execute>[0],
                      toolContext: Parameters<typeof execute>[1],
                    ) =>
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
        const run = runAdapter.run as unknown as (
          runOptions: typeof options & {
            currentMessage?: typeof currentMessage
          },
        ) =>
          | Promise<ChatModelRunResult>
          | AsyncGenerator<ChatModelRunResult, void>
        const result = run({
          ...options,
          abortSignal,
          context: guardedContext,
          currentMessage: hasCompletedTool
            ? currentMessage
            : undefined,
        })
        if (!(Symbol.asyncIterator in result)) {
          const chunk = await result
          if (abortSignal.aborted || getEpoch() !== epoch) return
          yield chunk
          return
        }
        for await (const chunk of result) {
          if (abortSignal.aborted || getEpoch() !== epoch) return
          yield chunk
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
  const modelMode = useModelModeApi()
  const delegatingAdapter = useMemo(
    () =>
      createDelegatingChatModelAdapter(
        adapter,
        modelMode.getPageAdapter,
      ),
    [modelMode],
  )
  const modelAdapter = useMemo(
    () =>
      createPageScopedModelAdapter(
        delegatingAdapter,
        () => epochRef.current,
      ),
    [delegatingAdapter],
  )
  const runtime = useLocalRuntime(modelAdapter, {
    maxSteps: 2,
    unstable_humanToolNames: [
      'recommend_canvas_layout',
      'propose_canvas_change',
    ],
  })
  return (
    <AssistantAvailabilityProvider>
      <AssistantPageSessionProvider runtime={runtime} epochRef={epochRef}>
        <AssistantModelModeProvider api={modelMode}>
          <AssistantRuntimeProvider runtime={runtime}>
            {children}
          </AssistantRuntimeProvider>
        </AssistantModelModeProvider>
      </AssistantPageSessionProvider>
    </AssistantAvailabilityProvider>
  )
}

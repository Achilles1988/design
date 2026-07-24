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

const adapter = createStreamTextAdapter({
  streamTextImpl: (opts) =>
    streamText(opts as Parameters<typeof streamText>[0]) as unknown as {
      fullStream: AsyncIterable<Record<string, unknown>>
    },
})

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
      for await (const chunk of runAdapter.run({
        messages: messages as never,
        abortSignal,
        context: context as never,
        currentMessage: hasCompletedTool
          ? (currentMessage as never)
          : undefined,
      })) {
        if (getEpoch() !== epoch) return
        yield chunk as unknown as ChatModelRunResult
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

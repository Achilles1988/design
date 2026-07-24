import { type ReactNode } from 'react'
import { streamText } from 'ai'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
} from '@assistant-ui/react'
import { AssistantAvailabilityProvider } from './availability'
import { createStreamTextAdapter } from './streamTextAdapter'

const adapter = createStreamTextAdapter({
  streamTextImpl: (opts) =>
    streamText(opts as Parameters<typeof streamText>[0]) as unknown as {
      fullStream: AsyncIterable<Record<string, unknown>>
    },
})

const modelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal, context, unstable_getMessage }) {
    const currentMessage = unstable_getMessage()
    const hasCompletedTool = currentMessage.content.some(
      (part) => part.type === 'tool-call' && part.result !== undefined,
    )
    for await (const chunk of adapter.run({
      messages: messages as never,
      abortSignal,
      context: context as never,
      currentMessage: hasCompletedTool ? (currentMessage as never) : undefined,
    })) {
      yield chunk as unknown as ChatModelRunResult
    }
  },
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const runtime = useLocalRuntime(modelAdapter, { maxSteps: 2 })
  return (
    <AssistantAvailabilityProvider>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </AssistantAvailabilityProvider>
  )
}

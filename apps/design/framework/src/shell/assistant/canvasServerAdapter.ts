import type {
  ChatModelAdapter,
  ChatModelRunResult,
  ThreadMessage,
} from '@assistant-ui/react'
import { readAiConfig } from '@/lib/ai/config'
import {
  CanvasRunEventSchema,
  type CanvasChatRequest,
} from '@/lib/canvasAssistantProtocol'
import { parseCanvasNdjson } from '@/lib/canvasAssistantApi'

const AI_CONFIG_GUIDANCE =
  'Configure an AI provider in Settings before starting a conversation.'

type CanvasAdapterRunOptions = Parameters<ChatModelAdapter['run']>[0] & {
  currentMessage?: ThreadMessage
}

function isStableMessage(message: ThreadMessage): boolean {
  return (
    message.role !== 'assistant' ||
    message.status.type === 'complete'
  )
}

function toRequestMessage(
  message: ThreadMessage,
): CanvasChatRequest['messages'][number] {
  return {
    role: message.role,
    content: message.content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text }
      }
      if (part.type === 'tool-call') {
        return {
          type: 'tool-call' as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: part.args,
          ...(part.result !== undefined ? { result: part.result } : {}),
          ...(part.isError !== undefined ? { isError: part.isError } : {}),
        }
      }
      throw new Error(
        `Canvas Assistant does not support the "${part.type}" message part.`,
      )
    }),
  }
}

export function createCanvasServerAdapter({
  appId,
  canvasId,
}: {
  appId: string
  canvasId: string
}): ChatModelAdapter {
  return {
    async *run(options) {
      const {
        messages,
        abortSignal,
        currentMessage,
      } = options as CanvasAdapterRunOptions
      const aiConfig = readAiConfig()
      if (!aiConfig) throw new Error(AI_CONFIG_GUIDANCE)

      const stableMessages = messages.filter(isStableMessage)
      const requestMessages = [
        ...stableMessages,
        ...(currentMessage ? [currentMessage] : []),
      ]
        .slice(-40)
        .map(toRequestMessage)
      const response = await fetch('/__design_ai/canvas/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          canvasId,
          aiConfig,
          messages: requestMessages,
        }),
        signal: abortSignal,
      })

      for await (const event of parseCanvasNdjson(
        response,
        CanvasRunEventSchema,
      )) {
        if (event.type === 'error') throw new Error(event.error)
        yield event.value as ChatModelRunResult
      }
    },
  }
}

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
import {
  getVisualAttachmentStore,
  parseAttachmentUri,
  type VisualAttachmentRecord,
  type VisualAttachmentStore,
} from './visualAttachmentStore'

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

function userMessageContent(
  message: ThreadMessage,
): ThreadMessage['content'] {
  if (message.role !== 'user' || !message.attachments?.length) {
    return message.content
  }
  return [
    ...message.content,
    ...message.attachments.flatMap((attachment) => attachment.content),
  ]
}

function toRequestMessage(
  message: ThreadMessage,
  attachments: ReadonlyMap<string, VisualAttachmentRecord>,
): CanvasChatRequest['messages'][number] {
  const content: CanvasChatRequest['messages'][number]['content'] = []
  const messageContent = userMessageContent(message)
  if (
    message.role !== 'user' &&
    messageContent.some((part) => part.type === 'image')
  ) {
    throw new Error(
      'Canvas Assistant supports image parts only in user messages.',
    )
  }
  for (const part of messageContent) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text })
      continue
    }
    if (part.type === 'image') {
      const id = parseAttachmentUri(part.image)
      if (!id) {
        throw new Error('Canvas Assistant received an invalid image reference.')
      }
      const record = attachments.get(id)
      if (record?.sourceUrl) {
        content.push({
          type: 'text',
          text: `Source URL: ${record.sourceUrl}`,
        })
      }
      content.push({ type: 'image', image: part.image })
      continue
    }
    if (part.type === 'tool-call') {
      content.push({
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: part.args,
        ...(part.result !== undefined ? { result: part.result } : {}),
        ...(part.isError !== undefined ? { isError: part.isError } : {}),
      })
      continue
    }
    throw new Error(
      `Canvas Assistant does not support the "${part.type}" message part.`,
    )
  }
  return {
    role: message.role,
    content,
  }
}

function referencedAttachmentIds(
  messages: readonly ThreadMessage[],
): string[] {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const part of userMessageContent(message)) {
      if (part.type !== 'image') continue
      const id = parseAttachmentUri(part.image)
      if (!id) {
        throw new Error('Canvas Assistant received an invalid image reference.')
      }
      ids.add(id)
    }
  }
  return [...ids]
}

export function createCanvasServerAdapter({
  appId,
  canvasId,
  visualStore,
}: {
  appId: string
  canvasId: string
  visualStore?: Pick<VisualAttachmentStore, 'get'>
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
      ].slice(-40)
      const attachmentRecords = new Map<
        string,
        VisualAttachmentRecord
      >()
      const ids = referencedAttachmentIds(requestMessages)
      if (ids.length > 0) {
        const store = visualStore ?? await getVisualAttachmentStore()
        for (const id of ids) {
          const record = await store.get(id)
          if (!record) {
            throw new Error('A referenced image is no longer available.')
          }
          attachmentRecords.set(id, record)
        }
      }
      const serializedMessages = requestMessages.map((message) =>
        toRequestMessage(message, attachmentRecords),
      )
      const form = new FormData()
      form.set('request', JSON.stringify({
        appId,
        canvasId,
        aiConfig,
        messages: serializedMessages,
      }))
      for (const id of ids) {
        const record = attachmentRecords.get(id)
        if (!record) {
          throw new Error('A referenced image is no longer available.')
        }
        form.set(`attachment:${id}`, record.blob, `${id}.image`)
      }
      const response = await fetch('/__design_ai/canvas/chat', {
        method: 'POST',
        body: form,
        signal: abortSignal,
      })

      for await (const event of parseCanvasNdjson(
        response,
        CanvasRunEventSchema,
      )) {
        if (event.type === 'error') {
          yield {
            status: {
              type: 'incomplete',
              reason: 'error',
              error: {
                code: 'unknown',
                message: event.error,
              },
            },
          }
          return
        }
        yield event.value as ChatModelRunResult
      }
    },
  }
}

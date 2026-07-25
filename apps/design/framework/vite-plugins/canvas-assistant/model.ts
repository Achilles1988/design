import {
  streamText,
  tool,
  type CoreMessage,
  type LanguageModelV1,
} from 'ai'
import { z } from 'zod'
import { createModel } from '../../src/lib/ai/client'
import type { AiConfig } from '../../src/lib/ai/config'
import {
  CanvasToolResultSchema,
  RawCanvasProposalSchema,
  type CanvasChatRequest,
  type CanvasProposalCardArgs,
  type LayoutRecommendationArgs,
} from '../../src/lib/canvasAssistantProtocol'
import type { CanvasAuthoringContext } from './context'
import { buildCanvasSystemPrompt } from './prompt'
import { sanitizeOriginalUserIntent } from './proposals'

const LayoutRecommendationRequestSchema = z.object({
  layoutId: z.string().min(1),
  reason: z.string().min(1),
})

type CanvasRunEvent =
  | {
      type: 'run-result'
      value: {
        content: RunResultContent
        status?: {
          type: 'requires-action'
          reason: 'tool-calls'
        }
        metadata?: { steps: Array<Record<string, never>> }
      }
    }
  | { type: 'error'; error: string }

type RunResultContent = Array<
  | { type: 'text'; text: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName:
        | 'recommend_canvas_layout'
        | 'propose_canvas_change'
      args: LayoutRecommendationArgs | CanvasProposalCardArgs
      argsText: string
    }
>

type ModelRunnerOptions = {
  streamTextImpl?: (options: Record<string, unknown>) => {
    fullStream: AsyncIterable<Record<string, unknown>>
  }
  createModelImpl?: (config: AiConfig) => LanguageModelV1
  stageProposal: (
    context: CanvasAuthoringContext,
    rawToolArgs: unknown,
    originalUserIntent: string,
  ) => CanvasProposalCardArgs
}

type ModelRunInput = {
  request: CanvasChatRequest
  attachments: ReadonlyMap<
    string,
    {
      bytes: Uint8Array
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
    }
  >
  context: CanvasAuthoringContext
  abortSignal: AbortSignal
}

function validatedMessages(
  messages: CanvasChatRequest['messages'],
): CanvasChatRequest['messages'] {
  return messages.map((message) => ({
    ...message,
    content: message.content.map((part) => {
      if (
        part.type !== 'tool-call' ||
        part.result === undefined ||
        (part.toolName !== 'recommend_canvas_layout' &&
          part.toolName !== 'propose_canvas_change')
      ) {
        return part
      }
      return {
        ...part,
        result: CanvasToolResultSchema.parse(part.result),
      }
    }),
  }))
}

function toCoreMessages(
  messages: CanvasChatRequest['messages'],
  attachments: ModelRunInput['attachments'],
): CoreMessage[] {
  const output: CoreMessage[] = []

  for (const message of validatedMessages(messages)) {
    if (message.role === 'system') {
      const text = message.content
        .filter(
          (part): part is Extract<typeof part, { type: 'text' }> =>
            part.type === 'text',
        )
        .map((part) => part.text)
        .join('\n')
      if (text) output.push({ role: message.role, content: text })
      continue
    }
    if (message.role === 'user') {
      const hasImages = message.content.some(
        (part) => part.type === 'image',
      )
      if (!hasImages) {
        const text = message.content
          .filter(
            (part): part is Extract<typeof part, { type: 'text' }> =>
              part.type === 'text',
          )
          .map((part) => part.text)
          .join('\n')
        if (text) output.push({ role: 'user', content: text })
        continue
      }

      const content: Extract<
        CoreMessage,
        { role: 'user' }
      >['content'] = []
      for (const part of message.content) {
        if (part.type === 'text') {
          content.push({ type: 'text', text: part.text })
          continue
        }
        if (part.type !== 'image') continue
        const id = part.image.slice('wn-attachment:'.length)
        const attachment = attachments.get(id)
        if (!attachment) {
          throw new Error('A referenced image is no longer available.')
        }
        content.push({
          type: 'image',
          image: attachment.bytes,
          mimeType: attachment.mimeType,
        })
      }
      output.push({ role: 'user', content })
      continue
    }

    let assistantContent: Extract<
      CoreMessage,
      { role: 'assistant' }
    >['content'] = []
    let toolContent: Extract<
      CoreMessage,
      { role: 'tool' }
    >['content'] = []
    const flush = () => {
      if (assistantContent.length > 0) {
        output.push({ role: 'assistant', content: assistantContent })
      }
      if (toolContent.length > 0) {
        output.push({ role: 'tool', content: toolContent })
      }
      assistantContent = []
      toolContent = []
    }

    for (const part of message.content) {
      if (part.type === 'text') {
        if (toolContent.length > 0) flush()
        assistantContent.push({ type: 'text', text: part.text })
        continue
      }
      if (part.type === 'image') {
        throw new Error(
          'Canvas Assistant supports image parts only in user messages.',
        )
      }
      assistantContent.push({
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: part.args ?? {},
      })
      if (part.result !== undefined) {
        toolContent.push({
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.result,
          isError: part.isError === true,
        })
      }
    }
    flush()
  }

  return output
}

const VISION_MODEL_ERROR =
  'The configured model does not support image input. Choose a vision-capable model or remove the images.'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return ''
}

function isUnsupportedVisualError(error: unknown): boolean {
  const message = errorMessage(error)
  return (
    /(?:does not support|doesn't support|not support|unsupported).{0,80}(?:image|visual|content type)/i.test(
      message,
    ) ||
    /(?:image|visual|content type).{0,80}(?:does not support|doesn't support|not supported|unsupported)/i.test(
      message,
    )
  )
}

function minimalOriginalUserIntent(
  messages: CanvasChatRequest['messages'],
): string {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user')
  const raw =
    latestUserMessage?.content
      .filter(
        (part): part is Extract<typeof part, { type: 'text' }> =>
          part.type === 'text',
      )
      .map((part) => part.text)
      .join('\n')
      .trim() ?? ''
  return sanitizeOriginalUserIntent(raw)
}

function recommendLayout(
  context: CanvasAuthoringContext,
  rawArgs: unknown,
): LayoutRecommendationArgs {
  const args = LayoutRecommendationRequestSchema.parse(rawArgs)
  const indexed = context.layoutIndex.find(
    (layout) => layout.id === args.layoutId,
  )
  if (!indexed || context.app.layouts.includes(args.layoutId)) {
    throw new Error('Layout recommendation is not available.')
  }
  return {
    layoutId: indexed.id,
    title: indexed.title,
    summary: indexed.summary,
    reason: args.reason,
    previewUrl: `/assets/layoutmd/${encodeURIComponent(indexed.id)}/preview.html`,
  }
}

function runResult(
  text: string,
  humanTool?: RunResultContent[number],
): CanvasRunEvent {
  const content: RunResultContent = []
  if (text) content.push({ type: 'text', text })
  if (humanTool) content.push(humanTool)
  return {
    type: 'run-result',
    value: {
      content,
      ...(humanTool
        ? {
            status: {
              type: 'requires-action' as const,
              reason: 'tool-calls' as const,
            },
            metadata: { steps: [{}] },
          }
        : {}),
    },
  }
}

export function createCanvasModelRunner(options: ModelRunnerOptions) {
  const stream = options.streamTextImpl ?? streamText
  const makeModel = options.createModelImpl ?? createModel

  return {
    async *run({
      request,
      attachments,
      context,
      abortSignal,
    }: ModelRunInput): AsyncGenerator<CanvasRunEvent> {
      const humanTools = {
        recommend_canvas_layout: tool({
          description:
            'Recommend one uninstalled library Layout and stop.',
          parameters: LayoutRecommendationRequestSchema,
        }),
        propose_canvas_change: tool({
          description:
            'Propose complete guarded files and stop for approval.',
          parameters: RawCanvasProposalSchema,
        }),
      }
      let text = ''

      try {
        const result = stream({
          model: makeModel(request.aiConfig),
          system: buildCanvasSystemPrompt(context),
          messages: toCoreMessages(request.messages, attachments),
          tools: humanTools,
          abortSignal,
        })
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            text +=
              typeof part.textDelta === 'string' ? part.textDelta : ''
            yield runResult(text)
            continue
          }
          if (part.type === 'error') {
            if (
              attachments.size > 0 &&
              isUnsupportedVisualError(part.error)
            ) {
              yield { type: 'error', error: VISION_MODEL_ERROR }
              return
            }
            throw new Error('AI model run failed.')
          }
          if (part.type !== 'tool-call') continue

          const toolCallId =
            typeof part.toolCallId === 'string' ? part.toolCallId : ''
          if (part.toolName === 'recommend_canvas_layout') {
            const args = recommendLayout(context, part.args)
            yield runResult(text, {
              type: 'tool-call',
              toolCallId,
              toolName: 'recommend_canvas_layout',
              args,
              argsText: JSON.stringify(args),
            })
            return
          }
          if (part.toolName === 'propose_canvas_change') {
            const args = options.stageProposal(
              context,
              part.args,
              minimalOriginalUserIntent(request.messages),
            )
            yield runResult(text, {
              type: 'tool-call',
              toolCallId,
              toolName: 'propose_canvas_change',
              args,
              argsText: JSON.stringify(args),
            })
            return
          }
          throw new Error('AI model returned an unsupported tool call.')
        }
      } catch (error) {
        if (
          attachments.size > 0 &&
          isUnsupportedVisualError(error)
        ) {
          yield { type: 'error', error: VISION_MODEL_ERROR }
          return
        }
        throw error
      }
    },
  }
}

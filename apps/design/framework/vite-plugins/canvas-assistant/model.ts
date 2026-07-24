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
  ) => CanvasProposalCardArgs
}

type ModelRunInput = {
  request: CanvasChatRequest
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
): CoreMessage[] {
  const output: CoreMessage[] = []

  for (const message of validatedMessages(messages)) {
    if (message.role !== 'assistant') {
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
      const result = stream({
        model: makeModel(request.aiConfig),
        system: buildCanvasSystemPrompt(context),
        messages: toCoreMessages(request.messages),
        tools: humanTools,
        abortSignal,
      })
      let text = ''

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          text += typeof part.textDelta === 'string' ? part.textDelta : ''
          yield runResult(text)
          continue
        }
        if (part.type === 'error') {
          throw new Error('AI model run failed.')
        }
        if (part.type !== 'tool-call') continue

        const toolCallId =
          typeof part.toolCallId === 'string' ? part.toolCallId : ''
        if (
          part.toolName === 'recommend_canvas_layout'
        ) {
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
          const args = options.stageProposal(context, part.args)
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
    },
  }
}

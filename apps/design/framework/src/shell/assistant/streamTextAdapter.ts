import {
  jsonSchema,
  tool as aiTool,
  type CoreMessage,
  type ToolExecutionOptions,
} from 'ai'
import { AiClientError, classify, createModel } from '@/lib/ai/client'
import { readAiConfig, type AiConfig } from '@/lib/ai/config'

export type SimpleThreadMessage = {
  role: 'user' | 'assistant' | 'system'
  content: Array<{ type: string; text?: string; [k: string]: unknown }>
}

export function toCoreMessages(
  messages: readonly SimpleThreadMessage[],
): CoreMessage[] {
  const out: CoreMessage[] = []

  for (const message of messages) {
    if (message.role !== 'assistant') {
      const text = message.content
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text as string)
        .join('\n')
      if (text.length > 0) out.push({ role: message.role, content: text })
      continue
    }

    let assistantContent: Extract<
      CoreMessage,
      { role: 'assistant' }
    >['content'] = []
    let toolContent: Extract<CoreMessage, { role: 'tool' }>['content'] = []

    const flush = () => {
      if (assistantContent.length > 0) {
        out.push({ role: 'assistant', content: assistantContent })
      }
      if (toolContent.length > 0) {
        out.push({ role: 'tool', content: toolContent })
      }
      assistantContent = []
      toolContent = []
    }

    for (const part of message.content) {
      if (part.type === 'text' && typeof part.text === 'string') {
        if (toolContent.length > 0) flush()
        assistantContent.push({ type: 'text', text: part.text })
        continue
      }
      if (
        part.type === 'tool-call' &&
        typeof part.toolCallId === 'string' &&
        typeof part.toolName === 'string'
      ) {
        assistantContent.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: part.args ?? {},
        })
        if ('result' in part && part.result !== undefined) {
          toolContent.push({
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result,
            isError: part.isError === true,
          })
        }
      }
    }

    flush()
  }

  return out
}

export type RunResultContent = Array<
  | { type: 'text'; text: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: unknown
      argsText: string
      result?: unknown
      isError?: boolean
    }
>

type AdapterTool = {
  description?: string
  parameters?: unknown
  execute?: (
    args: unknown,
    context: {
      toolCallId: string
      abortSignal: AbortSignal
      human: (payload: unknown) => Promise<unknown>
    },
  ) => unknown | Promise<unknown>
}

export type AdapterContext = {
  system?: string
  tools?: Record<string, AdapterTool>
}

export type AdapterRunOptions = {
  messages: readonly SimpleThreadMessage[]
  abortSignal: AbortSignal
  context?: AdapterContext
  currentMessage?: SimpleThreadMessage
}

export type AdapterDeps = {
  streamTextImpl: (opts: Record<string, unknown>) => {
    fullStream: AsyncIterable<Record<string, unknown>>
  }
  createModelImpl?: (config: AiConfig) => unknown
  readConfig?: () => AiConfig | null
}

/**
 * assistant-ui tools store `parameters` as either a StandardSchema (e.g. zod)
 * or a plain JSONSchema7. ai-sdk `tool()` accepts a zod/StandardSchema directly
 * but needs a `jsonSchema()` wrapper for plain JSON schema objects.
 */
export function toAiToolParameters(parameters: unknown): unknown {
  if (parameters && typeof parameters === 'object') {
    const p = parameters as Record<string, unknown>
    const isStandardOrZod =
      '~standard' in p || '_def' in p || typeof p.safeParse === 'function'
    if (isStandardOrZod) return parameters
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jsonSchema((parameters ?? { type: 'object', properties: {} }) as any)
}

export function buildTools(tools: AdapterContext['tools']) {
  if (!tools) return undefined
  const out: Record<string, unknown> = {}
  for (const [name, def] of Object.entries(tools)) {
    const execute = def.execute
      ? async (args: unknown, options: ToolExecutionOptions) =>
          def.execute!(args, {
            toolCallId: options.toolCallId,
            abortSignal:
              options.abortSignal ?? new AbortController().signal,
            human: async () => {
              throw new Error(
                'Human input is not supported by this chat adapter.',
              )
            },
          })
      : undefined
    const definition = {
      description: def.description ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: toAiToolParameters(def.parameters) as any,
    }
    out[name] = execute
      ? aiTool({
          ...definition,
          // LocalRuntime does not execute registered frontend tools. Forward
          // the browser-local implementation so AI SDK emits the tool result.
          execute,
        })
      : aiTool({
          ...definition,
        })
  }
  return out
}

export function createStreamTextAdapter(deps: AdapterDeps) {
  const makeModel = deps.createModelImpl ?? createModel
  const getConfig = deps.readConfig ?? readAiConfig
  return {
    async *run({
      messages,
      abortSignal,
      context,
      currentMessage,
    }: AdapterRunOptions): AsyncGenerator<{
      content: RunResultContent
      status?: { type: 'requires-action'; reason: 'tool-calls' }
      metadata?: { steps: Array<Record<string, never>> }
    }> {
      const config = getConfig()
      if (!config) {
        throw new AiClientError(
          'unknown',
          'Configure an AI provider in Settings before starting a conversation.',
        )
      }
      try {
        const stream = deps.streamTextImpl({
          model: makeModel(config),
          system: context?.system,
          messages: toCoreMessages(
            currentMessage ? [...messages, currentMessage] : messages,
          ),
          tools: buildTools(context?.tools),
          abortSignal,
        })
        let text = ''
        const toolCalls = new Map<
          string,
          {
            toolName: string
            args: unknown
            result?: unknown
            isError?: boolean
          }
        >()
        const emit = (): { content: RunResultContent } => {
          const content: RunResultContent = []
          if (text.length > 0) content.push({ type: 'text', text })
          for (const [id, tc] of toolCalls) {
            content.push({
              type: 'tool-call',
              toolCallId: id,
              toolName: tc.toolName,
              args: tc.args,
              argsText: JSON.stringify(tc.args ?? {}),
              ...(tc.result !== undefined ? { result: tc.result } : {}),
              ...(tc.isError !== undefined ? { isError: tc.isError } : {}),
            })
          }
          return { content }
        }
        let requestedTool = false
        for await (const part of stream.fullStream) {
          const p = part as {
            type: string
            textDelta?: string
            toolCallId?: string
            toolName?: string
            args?: unknown
            result?: unknown
            error?: unknown
          }
          if (p.type === 'text-delta') {
            text += p.textDelta ?? ''
            yield emit()
          } else if (p.type === 'tool-call') {
            requestedTool = true
            toolCalls.set(p.toolCallId as string, {
              toolName: p.toolName as string,
              args: p.args,
            })
            yield emit()
          } else if (p.type === 'tool-result') {
            const existing = toolCalls.get(p.toolCallId as string)
            toolCalls.set(p.toolCallId as string, {
              toolName: p.toolName as string,
              args: p.args ?? existing?.args ?? {},
              result: p.result,
              isError: false,
            })
            yield emit()
          } else if (p.type === 'error') {
            throw classify(p.error)
          }
        }

        if (requestedTool) {
          yield {
            ...emit(),
            status: { type: 'requires-action', reason: 'tool-calls' },
            metadata: { steps: [{}] },
          }
        }
      } catch (err) {
        throw classify(err)
      }
    },
  }
}

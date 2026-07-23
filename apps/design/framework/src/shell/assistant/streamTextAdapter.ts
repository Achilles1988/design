import { jsonSchema, tool as aiTool } from 'ai'
import { AiClientError, classify, createModel } from '@/lib/ai/client'
import { readAiConfig, type AiConfig } from '@/lib/ai/config'

export type SimpleThreadMessage = {
  role: 'user' | 'assistant' | 'system'
  content: Array<{ type: string; text?: string; [k: string]: unknown }>
}

export type CoreMessage = { role: 'user' | 'assistant' | 'system'; content: string }

export function toCoreMessages(messages: readonly SimpleThreadMessage[]): CoreMessage[] {
  const out: CoreMessage[] = []
  for (const m of messages) {
    const text = m.content
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n')
    if (text.length > 0) out.push({ role: m.role, content: text })
  }
  return out
}

export type RunResultContent = Array<
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown; argsText: string }
>

export type AdapterContext = {
  system?: string
  tools?: Record<string, { description?: string; parameters?: unknown }>
}

export type AdapterRunOptions = {
  messages: readonly SimpleThreadMessage[]
  abortSignal: AbortSignal
  context?: AdapterContext
}

export type AdapterDeps = {
  streamTextImpl: (opts: Record<string, unknown>) => {
    fullStream: AsyncIterable<Record<string, unknown>>
  }
  createModelImpl?: (config: AiConfig) => unknown
  readConfig?: () => AiConfig | null
}

function buildTools(tools: AdapterContext['tools']) {
  if (!tools) return undefined
  const out: Record<string, unknown> = {}
  for (const [name, def] of Object.entries(tools)) {
    out[name] = aiTool({
      description: def.description ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: jsonSchema((def.parameters ?? { type: 'object', properties: {} }) as any),
      // no execute: assistant-ui runtime executes the registered tool
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
    }: AdapterRunOptions): AsyncGenerator<{ content: RunResultContent }> {
      const config = getConfig()
      if (!config) throw new AiClientError('unknown', '请先在 Settings 配置 AI provider。')
      try {
        const stream = deps.streamTextImpl({
          model: makeModel(config),
          system: context?.system,
          messages: toCoreMessages(messages),
          tools: buildTools(context?.tools),
          abortSignal,
        })
        let text = ''
        const toolCalls = new Map<string, { toolName: string; args: unknown }>()
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
            })
          }
          return { content }
        }
        for await (const part of stream.fullStream) {
          const p = part as {
            type: string
            textDelta?: string
            toolCallId?: string
            toolName?: string
            args?: unknown
            error?: unknown
          }
          if (p.type === 'text-delta') {
            text += p.textDelta ?? ''
            yield emit()
          } else if (p.type === 'tool-call') {
            toolCalls.set(p.toolCallId as string, {
              toolName: p.toolName as string,
              args: p.args,
            })
            yield emit()
          } else if (p.type === 'error') {
            throw classify(p.error)
          }
        }
      } catch (err) {
        throw classify(err)
      }
    },
  }
}

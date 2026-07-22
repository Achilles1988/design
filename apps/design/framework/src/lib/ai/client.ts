import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import type { AiConfig } from './config'
import { ReplySchema, type Reply } from './schema'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type AiClientErrorKind = 'auth' | 'network' | 'schema' | 'unknown'

export class AiClientError extends Error {
  readonly kind: AiClientErrorKind
  constructor(kind: AiClientErrorKind, message: string) {
    super(message)
    this.name = 'AiClientError'
    this.kind = kind
  }
}

function classify(err: unknown): AiClientError {
  if (err instanceof AiClientError) return err
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'AI request failed'
  const lower = message.toLowerCase()
  if (lower.includes('401') || lower.includes('unauthor') || lower.includes('api key')) {
    return new AiClientError('auth', message)
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) {
    return new AiClientError('network', message)
  }
  if (lower.includes('schema') || lower.includes('parse') || lower.includes('validation')) {
    return new AiClientError('schema', message)
  }
  return new AiClientError('unknown', message)
}

export type RunAssetSearchTurnInput = {
  config: AiConfig
  systemPrompt: string
  messages: ChatMessage[]
}

export async function runAssetSearchTurn(input: RunAssetSearchTurnInput): Promise<Reply> {
  const { config, systemPrompt, messages } = input
  try {
    const model =
      config.provider === 'anthropic'
        ? createAnthropic({ apiKey: config.apiKey })(config.model)
        : createOpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
          })(config.model)

    const result = await generateObject({
      model,
      system: systemPrompt,
      messages,
      schema: ReplySchema,
    })
    return result.object as Reply
  } catch (err) {
    throw classify(err)
  }
}

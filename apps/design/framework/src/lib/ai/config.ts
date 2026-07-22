export type AiProvider = 'anthropic' | 'openai'

export type AiConfig = {
  provider: AiProvider
  baseURL?: string
  apiKey: string
  model: string
}

const STORAGE_KEY = 'wn.ai.config'

function isProvider(value: unknown): value is AiProvider {
  return value === 'anthropic' || value === 'openai'
}

export function readAiConfig(): AiConfig | null {
  let raw: string | null
  try {
    raw = globalThis.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  if (!isProvider(record.provider)) return null
  if (typeof record.apiKey !== 'string' || record.apiKey.length === 0) return null
  if (typeof record.model !== 'string' || record.model.length === 0) return null
  const baseURL =
    record.provider === 'openai' &&
    typeof record.baseURL === 'string' &&
    record.baseURL.length > 0
      ? record.baseURL
      : undefined
  return {
    provider: record.provider,
    apiKey: record.apiKey,
    model: record.model,
    ...(baseURL ? { baseURL } : {}),
  }
}

export function writeAiConfig(config: AiConfig): void {
  const payload: AiConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    ...(config.provider === 'openai' && config.baseURL
      ? { baseURL: config.baseURL }
      : {}),
  }
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / private-mode failures
  }
}

export function clearAiConfig(): void {
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function hasValidConfig(): boolean {
  return readAiConfig() !== null
}

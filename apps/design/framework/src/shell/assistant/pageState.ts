import type { ThreadMessage, ThreadMessageLike } from '@assistant-ui/react'
import type { Filter } from '@/lib/ai/filterState'

export const ASSISTANT_PAGE_STATE_STORAGE_KEY = 'wn.assistant.page-state.v1'
const CONTEXT_QUERY_KEYS = new Set(['appId'])

export type PersistedMessage = {
  id: string
  role: 'assistant' | 'user' | 'system'
  content: ThreadMessageLike['content']
  createdAt: string
}

export type AssistantPageStateV1 = {
  version: 1
  messages: PersistedMessage[]
  filter?: Filter
  updatedAt: string
}

type AssistantPageStateEnvelopeV1 = {
  version: 1
  pages: Record<string, AssistantPageStateV1>
}

const memoryPagesByStorage =
  new WeakMap<Storage, Map<string, AssistantPageStateV1 | null>>()

export type AssistantPageStatePatch = {
  messages?: PersistedMessage[]
  filter?: Filter
}

export type StoreWriteResult =
  | { ok: true; state: AssistantPageStateV1 }
  | { ok: false; state: AssistantPageStateV1; error: string }

const emptyState = (): AssistantPageStateV1 => ({
  version: 1,
  messages: [],
  updatedAt: new Date(0).toISOString(),
})

export function createAssistantPageKey(
  location: Pick<Location, 'pathname' | 'search'>,
): string {
  const pathname =
    location.pathname.length > 1
      ? location.pathname.replace(/\/+$/, '')
      : '/'
  const source = new URLSearchParams(location.search)
  const target = new URLSearchParams()
  for (const key of [...CONTEXT_QUERY_KEYS].sort()) {
    for (const value of source.getAll(key).sort()) target.append(key, value)
  }
  const query = target.toString()
  return query ? `${pathname}?${query}` : pathname
}

function isFilter(value: unknown): value is Filter {
  if (!value || typeof value !== 'object') return false
  const chips = (value as { chips?: unknown }).chips
  return Array.isArray(chips) && chips.every((chip) => {
    if (!chip || typeof chip !== 'object') return false
    const candidate = chip as Record<string, unknown>
    return (
      typeof candidate.id === 'string' &&
      ['tag', 'origin', 'freeform'].includes(String(candidate.kind)) &&
      typeof candidate.label === 'string' &&
      typeof candidate.value === 'string' &&
      ['user', 'ai'].includes(String(candidate.addedBy))
    )
  })
}

function isPersistedMessage(value: unknown): value is PersistedMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    ['assistant', 'user', 'system'].includes(String(candidate.role)) &&
    (typeof candidate.content === 'string' || Array.isArray(candidate.content)) &&
    typeof candidate.createdAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  )
}

const volatileValues = new Map<string, string>()
const volatileStorage: Storage = {
  get length() {
    return volatileValues.size
  },
  clear() {
    volatileValues.clear()
  },
  getItem(key) {
    return volatileValues.get(key) ?? null
  },
  key(index) {
    return [...volatileValues.keys()][index] ?? null
  },
  removeItem(key) {
    volatileValues.delete(key)
  },
  setItem(key, value) {
    volatileValues.set(key, value)
  },
}

function parseEnvelope(storage: Storage): AssistantPageStateEnvelopeV1 {
  try {
    const parsed = JSON.parse(
      storage.getItem(ASSISTANT_PAGE_STATE_STORAGE_KEY) ?? 'null',
    ) as { version?: unknown; pages?: unknown } | null
    if (parsed?.version !== 1 || !parsed.pages || typeof parsed.pages !== 'object') {
      return { version: 1, pages: {} }
    }
    const pages: Record<string, AssistantPageStateV1> = {}
    for (const [key, raw] of Object.entries(parsed.pages)) {
      if (!raw || typeof raw !== 'object') continue
      const state = raw as Partial<AssistantPageStateV1>
      if (
        state.version !== 1 ||
        !Array.isArray(state.messages) ||
        !state.messages.every(isPersistedMessage)
      ) continue
      pages[key] = {
        version: 1,
        messages: state.messages,
        ...(isFilter(state.filter) ? { filter: state.filter } : {}),
        updatedAt:
          typeof state.updatedAt === 'string'
            ? state.updatedAt
            : new Date(0).toISOString(),
      }
    }
    return { version: 1, pages }
  } catch {
    return { version: 1, pages: {} }
  }
}

function resolveStorage(storage?: Storage): Storage {
  if (storage) return storage
  try {
    return window.localStorage
  } catch {
    return volatileStorage
  }
}

function memoryPages(storage: Storage) {
  let pages = memoryPagesByStorage.get(storage)
  if (!pages) {
    pages = new Map()
    memoryPagesByStorage.set(storage, pages)
  }
  return pages
}

export function readAssistantPageState(
  pageKey: string,
  storage?: Storage,
): AssistantPageStateV1 {
  try {
    const target = resolveStorage(storage)
    const fallback = memoryPages(target)
    if (fallback.has(pageKey)) return fallback.get(pageKey) ?? emptyState()
    return parseEnvelope(target).pages[pageKey] ?? emptyState()
  } catch {
    return emptyState()
  }
}

export function patchAssistantPageState(
  pageKey: string,
  patch: AssistantPageStatePatch,
  storage?: Storage,
): StoreWriteResult {
  const target = resolveStorage(storage)
  const envelope = parseEnvelope(target)
  const state: AssistantPageStateV1 = {
    ...readAssistantPageState(pageKey, target),
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  }
  envelope.pages[pageKey] = state
  try {
    target.setItem(ASSISTANT_PAGE_STATE_STORAGE_KEY, JSON.stringify(envelope))
    memoryPages(target).delete(pageKey)
    return { ok: true, state }
  } catch (error) {
    memoryPages(target).set(pageKey, state)
    return {
      ok: false,
      state,
      error: error instanceof Error ? error.message : 'Conversation could not be saved.',
    }
  }
}

export function clearAssistantPageState(
  pageKey: string,
  storage?: Storage,
): StoreWriteResult {
  const target = resolveStorage(storage)
  const envelope = parseEnvelope(target)
  delete envelope.pages[pageKey]
  const state = emptyState()
  try {
    target.setItem(ASSISTANT_PAGE_STATE_STORAGE_KEY, JSON.stringify(envelope))
    memoryPages(target).delete(pageKey)
    return { ok: true, state }
  } catch (error) {
    memoryPages(target).set(pageKey, null)
    return {
      ok: false,
      state,
      error: error instanceof Error ? error.message : 'Conversation could not be cleared.',
    }
  }
}

export function serializeMessages(
  messages: readonly ThreadMessage[],
): PersistedMessage[] {
  return messages
    .filter(
      (message) =>
        message.role !== 'assistant' || message.status.type === 'complete',
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }))
}

export function restoreMessages(
  messages: readonly PersistedMessage[],
): ThreadMessageLike[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt),
    ...(message.role === 'assistant'
      ? { status: { type: 'complete' as const, reason: 'unknown' as const } }
      : {}),
  }))
}

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

type MemoryPageOverlay = {
  state: AssistantPageStateV1 | null
}

const memoryPagesByStorage =
  new WeakMap<Storage, Map<string, MemoryPageOverlay>>()

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
    const value = source.get(key)?.trim()
    if (value) target.set(key, value)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) {
    if (seen.has(value)) return false
    seen.add(value)
    const valid = value.every((item) => isJsonValue(item, seen))
    seen.delete(value)
    return valid
  }
  if (!isRecord(value)) return false
  if (seen.has(value)) return false
  seen.add(value)
  const valid = Object.values(value).every((item) => isJsonValue(item, seen))
  seen.delete(value)
  return valid
}

function hasOptionalString(
  candidate: Record<string, unknown>,
  key: string,
): boolean {
  return candidate[key] === undefined || typeof candidate[key] === 'string'
}

function isMessagePart(
  value: unknown,
  role: PersistedMessage['role'],
): boolean {
  if (!isRecord(value) || typeof value.type !== 'string' || !isJsonValue(value)) {
    return false
  }

  if (value.type === 'text') return typeof value.text === 'string'
  if (role === 'system') return false

  if (role === 'user') {
    if (value.type === 'image') return typeof value.image === 'string'
    if (value.type === 'file') {
      return (
        typeof value.data === 'string' &&
        typeof value.mimeType === 'string' &&
        hasOptionalString(value, 'filename')
      )
    }
    if (value.type === 'audio') {
      return (
        isRecord(value.audio) &&
        typeof value.audio.data === 'string' &&
        ['mp3', 'wav'].includes(String(value.audio.format))
      )
    }
    if (value.type === 'data') {
      return typeof value.name === 'string' && isJsonValue(value.data)
    }
    return value.type.startsWith('data-') && isJsonValue(value.data)
  }

  if (value.type === 'reasoning') return typeof value.text === 'string'
  if (value.type === 'image') return typeof value.image === 'string'
  if (value.type === 'file') {
    return (
      typeof value.data === 'string' &&
      typeof value.mimeType === 'string' &&
      hasOptionalString(value, 'filename')
    )
  }
  if (value.type === 'source') {
    if (
      typeof value.id !== 'string' ||
      !['url', 'document'].includes(String(value.sourceType))
    ) return false
    return value.sourceType === 'url'
      ? typeof value.url === 'string' && hasOptionalString(value, 'title')
      : (
          typeof value.title === 'string' &&
          typeof value.mediaType === 'string' &&
          hasOptionalString(value, 'filename')
        )
  }
  if (value.type === 'data') {
    return typeof value.name === 'string' && isJsonValue(value.data)
  }
  if (value.type.startsWith('data-')) return isJsonValue(value.data)
  if (value.type === 'generative-ui') return isRecord(value.spec)
  if (value.type !== 'tool-call') return false

  return (
    typeof value.toolName === 'string' &&
    value.toolName.length > 0 &&
    (
      value.toolCallId === undefined ||
      (typeof value.toolCallId === 'string' && value.toolCallId.length > 0)
    ) &&
    (value.args === undefined || isRecord(value.args) && isJsonValue(value.args)) &&
    (value.result === undefined || isJsonValue(value.result)) &&
    hasOptionalString(value, 'argsText') &&
    (value.isError === undefined || typeof value.isError === 'boolean')
  )
}

function isMessageContent(
  content: unknown,
  role: PersistedMessage['role'],
): content is PersistedMessage['content'] {
  if (typeof content === 'string') return true
  if (!Array.isArray(content)) return false
  if (role === 'system') {
    return content.length === 1 && isMessagePart(content[0], role)
  }
  return content.every((part) => isMessagePart(part, role))
}

function isPersistedMessage(value: unknown): value is PersistedMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const role = candidate.role
  return (
    typeof candidate.id === 'string' &&
    ['assistant', 'user', 'system'].includes(String(role)) &&
    isMessageContent(
      candidate.content,
      role as PersistedMessage['role'],
    ) &&
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

function parseEnvelope(storage: Storage): {
  envelope: AssistantPageStateEnvelopeV1
  needsRepair: boolean
} {
  try {
    const parsed = JSON.parse(
      storage.getItem(ASSISTANT_PAGE_STATE_STORAGE_KEY) ?? 'null',
    ) as { version?: unknown; pages?: unknown } | null
    if (parsed?.version !== 1 || !parsed.pages || typeof parsed.pages !== 'object') {
      return {
        envelope: { version: 1, pages: {} },
        needsRepair: parsed !== null,
      }
    }
    const pages: Record<string, AssistantPageStateV1> = {}
    let needsRepair = false
    for (const [key, raw] of Object.entries(parsed.pages)) {
      if (!raw || typeof raw !== 'object') {
        needsRepair = true
        continue
      }
      const state = raw as Partial<AssistantPageStateV1>
      if (
        state.version !== 1 ||
        !Array.isArray(state.messages) ||
        !state.messages.every(isPersistedMessage)
      ) {
        needsRepair = true
        continue
      }
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
    return {
      envelope: { version: 1, pages },
      needsRepair,
    }
  } catch {
    return {
      envelope: { version: 1, pages: {} },
      needsRepair: true,
    }
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

function persistDirtyPages(
  storage: Storage,
  fallbackError: string,
): { ok: true } | { ok: false; error: string } {
  const overlays = memoryPages(storage)
  const included = [...overlays.entries()]
  const envelope = parseEnvelope(storage).envelope
  for (const [pageKey, overlay] of included) {
    if (overlay.state === null) {
      delete envelope.pages[pageKey]
    } else {
      envelope.pages[pageKey] = overlay.state
    }
  }

  try {
    storage.setItem(
      ASSISTANT_PAGE_STATE_STORAGE_KEY,
      JSON.stringify(envelope),
    )
    for (const [pageKey, overlay] of included) {
      if (overlays.get(pageKey) === overlay) overlays.delete(pageKey)
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallbackError,
    }
  }
}

export function readAssistantPageState(
  pageKey: string,
  storage?: Storage,
): AssistantPageStateV1 {
  try {
    const target = resolveStorage(storage)
    const fallback = memoryPages(target)
    const overlay = fallback.get(pageKey)
    if (overlay) return overlay.state ?? emptyState()
    const parsed = parseEnvelope(target)
    if (parsed.needsRepair) {
      try {
        target.setItem(
          ASSISTANT_PAGE_STATE_STORAGE_KEY,
          JSON.stringify(parsed.envelope),
        )
      } catch {
        // Read recovery remains best-effort; callers still receive empty state.
      }
    }
    return parsed.envelope.pages[pageKey] ?? emptyState()
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
  const state: AssistantPageStateV1 = {
    ...readAssistantPageState(pageKey, target),
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  }
  memoryPages(target).set(pageKey, { state })
  const persisted = persistDirtyPages(
    target,
    'Conversation could not be saved.',
  )
  if (target === volatileStorage) {
    return {
      ok: false,
      state,
      error: 'Browser storage is unavailable.',
    }
  }
  if (persisted.ok) {
    return { ok: true, state }
  }
  return { ok: false, state, error: persisted.error }
}

export function clearAssistantPageState(
  pageKey: string,
  storage?: Storage,
): StoreWriteResult {
  const target = resolveStorage(storage)
  const state = emptyState()
  memoryPages(target).set(pageKey, { state: null })
  const persisted = persistDirtyPages(
    target,
    'Conversation could not be cleared.',
  )
  if (target === volatileStorage) {
    return {
      ok: false,
      state,
      error: 'Browser storage is unavailable.',
    }
  }
  if (persisted.ok) {
    return { ok: true, state }
  }
  return { ok: false, state, error: persisted.error }
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
    .filter(isPersistedMessage)
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

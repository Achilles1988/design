import type { ThreadMessage, ThreadMessageLike } from '@assistant-ui/react'
import type { Filter } from '@/lib/ai/filterState'
import {
  ApplyFilterArgsSchema,
  ApplyFilterResultSchema,
} from '@/lib/ai/schema'

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

export type AssistantPageStatePatch = {
  messages?: PersistedMessage[]
  filter?: Filter
}

type MemoryPageOverlay = {
  cleared: boolean
  patch: AssistantPageStatePatch
  updatedAt: string
}

const memoryPagesByStorage =
  new WeakMap<Storage, Map<string, MemoryPageOverlay>>()
const browserMemoryPages = new Map<string, MemoryPageOverlay>()

export type StoreWriteResult =
  | { ok: true; state: AssistantPageStateV1 }
  | { ok: false; state: AssistantPageStateV1; error: string }

export type AssistantPageStateReadResult = {
  state: AssistantPageStateV1
  authoritative: boolean
}

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

  const validToolCall = (
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
  if (!validToolCall) return false
  if (value.toolName !== 'apply_filter') return true
  return (
    value.args !== undefined &&
    ApplyFilterArgsSchema.safeParse(value.args).success &&
    (
      value.result === undefined ||
      ApplyFilterResultSchema.safeParse(value.result).success
    )
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

type ParseEnvelopeResult =
  | {
      status: 'available'
      envelope: AssistantPageStateEnvelopeV1
      needsRepair: boolean
    }
  | { status: 'unavailable' }

function parseEnvelope(storage: Storage): ParseEnvelopeResult {
  let raw: string | null
  try {
    raw = storage.getItem(ASSISTANT_PAGE_STATE_STORAGE_KEY)
  } catch {
    return { status: 'unavailable' }
  }

  try {
    const parsed = JSON.parse(raw ?? 'null') as {
      version?: unknown
      pages?: unknown
    } | null
    if (parsed?.version !== 1 || !parsed.pages || typeof parsed.pages !== 'object') {
      return {
        status: 'available',
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
      const {
        version: _version,
        messages: _messages,
        filter: _filter,
        updatedAt: _updatedAt,
        ...unknownFields
      } = state
      pages[key] = {
        ...unknownFields,
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
      status: 'available',
      envelope: { version: 1, pages },
      needsRepair,
    }
  } catch {
    return {
      status: 'available',
      envelope: { version: 1, pages: {} },
      needsRepair: true,
    }
  }
}

type ResolvedStorage = {
  target: Storage
  overlays: Map<string, MemoryPageOverlay>
  authoritative: boolean
}

function resolveStorage(storage?: Storage): ResolvedStorage {
  if (storage) {
    return {
      target: storage,
      overlays: memoryPages(storage),
      authoritative: true,
    }
  }
  try {
    const durableStorage = window.localStorage
    const authoritative = migrateVolatilePages(
      durableStorage,
      browserMemoryPages,
    )
    return {
      target: authoritative ? durableStorage : volatileStorage,
      overlays: browserMemoryPages,
      authoritative,
    }
  } catch {
    return {
      target: volatileStorage,
      overlays: browserMemoryPages,
      authoritative: false,
    }
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

function applyOverlays(
  envelope: AssistantPageStateEnvelopeV1,
  included: Array<[string, MemoryPageOverlay]>,
): void {
  for (const [pageKey, overlay] of included) {
    const state = materializeOverlay(envelope.pages[pageKey], overlay)
    if (state === null) {
      delete envelope.pages[pageKey]
    } else {
      envelope.pages[pageKey] = state
    }
  }
}

function materializeOverlay(
  base: AssistantPageStateV1 | undefined,
  overlay: MemoryPageOverlay,
): AssistantPageStateV1 | null {
  const hasPatch =
    overlay.patch.messages !== undefined ||
    overlay.patch.filter !== undefined
  if (overlay.cleared && !hasPatch) return null
  return {
    ...(overlay.cleared ? emptyState() : base ?? emptyState()),
    ...overlay.patch,
    version: 1,
    updatedAt: overlay.updatedAt,
  }
}

function clearPersistedOverlays(
  overlays: Map<string, MemoryPageOverlay>,
  included: Array<[string, MemoryPageOverlay]>,
): void {
  for (const [pageKey, overlay] of included) {
    if (overlays.get(pageKey) === overlay) overlays.delete(pageKey)
  }
}

function persistEnvelopeWithOverlays(
  storage: Storage,
  envelope: AssistantPageStateEnvelopeV1,
  fallbackError: string,
  overlays: Map<string, MemoryPageOverlay>,
):
  | { ok: true; envelope: AssistantPageStateEnvelopeV1 }
  | { ok: false; error: string } {
  const included = [...overlays.entries()]
  applyOverlays(envelope, included)
  try {
    storage.setItem(
      ASSISTANT_PAGE_STATE_STORAGE_KEY,
      JSON.stringify(envelope),
    )
    clearPersistedOverlays(overlays, included)
    return { ok: true, envelope }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallbackError,
    }
  }
}

function persistDirtyPages(
  storage: Storage,
  fallbackError: string,
  overlays: Map<string, MemoryPageOverlay>,
):
  | { ok: true; envelope: AssistantPageStateEnvelopeV1 }
  | { ok: false; error: string } {
  const parsed = parseEnvelope(storage)
  if (parsed.status === 'unavailable') {
    return { ok: false, error: fallbackError }
  }
  return persistEnvelopeWithOverlays(
    storage,
    parsed.envelope,
    fallbackError,
    overlays,
  )
}

function migrateVolatilePages(
  storage: Storage,
  overlays: Map<string, MemoryPageOverlay>,
): boolean {
  const volatileParsed = parseEnvelope(volatileStorage)
  const volatilePages = volatileParsed.status === 'available'
    ? volatileParsed.envelope.pages
    : {}
  if (
    overlays.size === 0 &&
    Object.keys(volatilePages).length === 0
  ) return true

  const durableParsed = parseEnvelope(storage)
  if (durableParsed.status === 'unavailable') return false
  const included = [...overlays.entries()]
  Object.assign(durableParsed.envelope.pages, volatilePages)
  applyOverlays(durableParsed.envelope, included)
  try {
    storage.setItem(
      ASSISTANT_PAGE_STATE_STORAGE_KEY,
      JSON.stringify(durableParsed.envelope),
    )
    clearPersistedOverlays(overlays, included)
    volatileStorage.removeItem(ASSISTANT_PAGE_STATE_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

function readResolvedPageState(
  pageKey: string,
  target: Storage,
  overlays: Map<string, MemoryPageOverlay>,
  authoritative: boolean,
): AssistantPageStateReadResult {
  const overlay = overlays.get(pageKey)
  const parsed = parseEnvelope(target)
  if (parsed.status === 'unavailable') {
    return {
      state: overlay
        ? materializeOverlay(undefined, overlay) ?? emptyState()
        : emptyState(),
      authoritative: false,
    }
  }
  if (parsed.needsRepair) {
    persistEnvelopeWithOverlays(
      target,
      parsed.envelope,
      'Conversation cache could not be repaired.',
      overlays,
    )
  }
  if (overlay) {
    return {
      state: materializeOverlay(
        parsed.envelope.pages[pageKey],
        overlay,
      ) ?? emptyState(),
      authoritative: authoritative && !overlays.has(pageKey),
    }
  }
  return {
    state: parsed.envelope.pages[pageKey] ?? emptyState(),
    authoritative,
  }
}

export function readAssistantPageState(
  pageKey: string,
  storage?: Storage,
): AssistantPageStateV1 {
  return readAssistantPageStateResult(pageKey, storage).state
}

export function readAssistantPageStateResult(
  pageKey: string,
  storage?: Storage,
): AssistantPageStateReadResult {
  try {
    const { target, overlays, authoritative } = resolveStorage(storage)
    return readResolvedPageState(
      pageKey,
      target,
      overlays,
      authoritative,
    )
  } catch {
    return {
      state: emptyState(),
      authoritative: false,
    }
  }
}

export function patchAssistantPageState(
  pageKey: string,
  patch: AssistantPageStatePatch,
  storage?: Storage,
): StoreWriteResult {
  const { target, overlays, authoritative } = resolveStorage(storage)
  const base = readResolvedPageState(
    pageKey,
    target,
    overlays,
    authoritative,
  ).state
  const existing = overlays.get(pageKey)
  const overlay: MemoryPageOverlay = {
    cleared: existing?.cleared ?? false,
    patch: {
      ...existing?.patch,
      ...patch,
    },
    updatedAt: new Date().toISOString(),
  }
  const state = materializeOverlay(base, overlay) ?? emptyState()
  overlays.set(pageKey, overlay)
  if (target === volatileStorage) {
    return {
      ok: false,
      state,
      error: 'Browser storage is unavailable.',
    }
  }
  const persisted = persistDirtyPages(
    target,
    'Conversation could not be saved.',
    overlays,
  )
  if (persisted.ok) {
    return {
      ok: true,
      state: persisted.envelope.pages[pageKey] ?? emptyState(),
    }
  }
  return { ok: false, state, error: persisted.error }
}

export function clearAssistantPageState(
  pageKey: string,
  storage?: Storage,
): StoreWriteResult {
  const { target, overlays } = resolveStorage(storage)
  const state = emptyState()
  overlays.set(pageKey, {
    cleared: true,
    patch: {},
    updatedAt: new Date().toISOString(),
  })
  if (target === volatileStorage) {
    return {
      ok: false,
      state,
      error: 'Browser storage is unavailable.',
    }
  }
  const persisted = persistDirtyPages(
    target,
    'Conversation could not be cleared.',
    overlays,
  )
  if (persisted.ok) {
    return { ok: true, state }
  }
  return { ok: false, state, error: persisted.error }
}

export function flattenUserMessageContent(
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
      content: flattenUserMessageContent(message),
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

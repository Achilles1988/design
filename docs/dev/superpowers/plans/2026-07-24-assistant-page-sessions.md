# Assistant Page Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个具体页面提供可跨刷新恢复的独立 AI 聊天与筛选状态，并让 `New chat` 同时清空当前页面聊天和筛选。

**Architecture:** 保留 Shell 级单一 assistant-ui `LocalRuntime`，新增版本化页面状态 Store 和页面会话协调器。协调器根据规范化 `pageKey` 保存、取消、恢复 Runtime；资产页通过 `usePageAssistant` 注册业务状态重置，并使用同一个 Store 持久化筛选。

**Tech Stack:** React 19、TypeScript 5.7、React Router 7、`@assistant-ui/react` 0.14、Vitest 3、Testing Library、浏览器 `localStorage`

## Global Constraints

- 严格遵循 `.wn-ai/lessons/lesson.md`、`docs/dev/conventions/mandatory.md` 和 `docs/dev/conventions/coding-standards.md`。
- `apps/design/apps/design/app.json` 的 `dashboard` style 是强制约束，`sidebar-shell` layout 是优先约束。
- 不新增第三方依赖。
- 所有新增用户界面文案使用英文。
- 页面状态按具体 pathname 和影响业务上下文的查询参数隔离；当前查询参数白名单仅包含 `appId`。
- `New chat` 必须同时清空当前页面聊天与筛选，不保留旧会话历史。
- 刷新或重启后恢复聊天与筛选；存储不可用时退化为内存会话。
- 明确筛选 prompt 必须通过 `apply_filter` 工具真实更新 chips、数量和资产内容；不能解析助手文本来更新筛选。
- 任何公共 assistant 契约变化必须在同一变更中更新 `docs/dev/api/assistant-ui-chat.md`。
- 每个任务遵循 TDD：先写失败测试并确认失败，再写最小实现。

---

## 文件结构

### 新建

- `apps/design/framework/src/shell/assistant/pageState.ts`
  - 页面键生成、消息序列化、版本化 localStorage Store。
- `apps/design/framework/src/shell/assistant/pageState.test.ts`
  - 页面键、序列化、校验、存储失败测试。
- `apps/design/framework/src/shell/assistant/pageSession.tsx`
  - 页面会话 Context、Runtime 保存/切换/重置协调。
- `apps/design/framework/src/shell/assistant/pageSession.test.tsx`
  - 页面切换、请求取消、恢复、新聊天和迟到结果隔离测试。
- `apps/design/framework/src/features/assets/usePersistentAssetFilter.ts`
  - 资产筛选恢复、校验、持久化和重置适配。
- `apps/design/framework/src/features/assets/usePersistentAssetFilter.test.tsx`
  - AI/手动筛选持久化、恢复、无效 chip 清理和重置测试。
- `apps/design/framework/src/features/assets/assistantFiltering.integration.test.tsx`
  - composer → adapter → `apply_filter` → 页面渲染的完整集成测试。

### 修改

- `apps/design/framework/src/shell/assistant/AssistantProvider.tsx`
  - 连接页面会话 Provider；为 adapter 增加页面代次门控。
- `apps/design/framework/src/shell/assistant/usePageAssistant.ts`
  - 注册当前页面业务状态重置回调。
- `apps/design/framework/src/shell/assistant/usePageAssistant.test.tsx`
  - 验证重置回调注册与卸载。
- `apps/design/framework/src/shell/assistant/AssistantPanel.tsx`
  - 增加 `New chat`、确认提示和持久化失败提示。
- `apps/design/framework/src/shell/assistant/AssistantPanel.test.tsx`
  - 覆盖新聊天确认、空状态直清、取消和焦点。
- `apps/design/framework/src/shell/assistant/AssistantThread.tsx`
  - 接收 composer input ref，供新聊天后恢复焦点。
- `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx`
  - 验证 ref 绑定。
- `apps/design/framework/src/shell/assistant/assistant.css`
  - 新聊天按钮和非阻塞警告样式。
- `apps/design/framework/src/lib/ai/filterState.ts`
  - 增加按资产索引清理失效筛选的纯函数。
- `apps/design/framework/src/lib/ai/filterState.test.ts`
  - 覆盖 tag、origin、freeform 的恢复校验。
- `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
  - 用持久化筛选 hook 代替页面内裸 `useState`。
- `apps/design/framework/src/features/assets/assistantFilterTool.tsx`
  - 保持工具使用最新 ref，并让持久化 setter 成为唯一更新入口。
- `docs/dev/api/assistant-ui-chat.md`
  - 记录页面会话、Store、重置和筛选集成契约。

## Task 1：页面键、消息快照与版本化 Store

**Files:**

- Create: `apps/design/framework/src/shell/assistant/pageState.ts`
- Create: `apps/design/framework/src/shell/assistant/pageState.test.ts`

**Interfaces:**

- Consumes: `Filter` from `@/lib/ai/filterState`; `ThreadMessage` and `ThreadMessageLike` from `@assistant-ui/react`.
- Produces:
  - `createAssistantPageKey(location: Pick<Location, 'pathname' | 'search'>): string`
  - `serializeMessages(messages: readonly ThreadMessage[]): PersistedMessage[]`
  - `restoreMessages(messages: readonly PersistedMessage[]): ThreadMessageLike[]`
  - `readAssistantPageState(pageKey: string, storage?: Storage): AssistantPageStateV1`
  - `patchAssistantPageState(pageKey: string, patch: AssistantPageStatePatch, storage?: Storage): StoreWriteResult`
  - `clearAssistantPageState(pageKey: string, storage?: Storage): StoreWriteResult`

- [ ] **Step 1: 写页面键和 Store 的失败测试**

在 `pageState.test.ts` 写出具体行为：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ASSISTANT_PAGE_STATE_STORAGE_KEY,
  clearAssistantPageState,
  createAssistantPageKey,
  patchAssistantPageState,
  readAssistantPageState,
  restoreMessages,
  serializeMessages,
} from './pageState'

describe('createAssistantPageKey', () => {
  it('separates concrete routes and keeps only sorted context parameters', () => {
    expect(createAssistantPageKey({
      pathname: '/apps/a/canvases/home/',
      search: '?view=grid&appId=b&appId=a',
    })).toBe('/apps/a/canvases/home?appId=a&appId=b')
    expect(createAssistantPageKey({
      pathname: '/apps/b',
      search: '',
    })).toBe('/apps/b')
  })
})

describe('assistant page state store', () => {
  beforeEach(() => localStorage.clear())

  it('patches one page without overwriting another page', () => {
    patchAssistantPageState('/assets/rule', {
      filter: { chips: [{ id: 'tag:dark', kind: 'tag', label: 'dark', value: 'dark', addedBy: 'ai' }] },
    })
    patchAssistantPageState('/assets/layout', {
      filter: { chips: [{ id: 'tag:grid', kind: 'tag', label: 'grid', value: 'grid', addedBy: 'user' }] },
    })

    expect(readAssistantPageState('/assets/rule').filter?.chips[0]?.id).toBe('tag:dark')
    expect(readAssistantPageState('/assets/layout').filter?.chips[0]?.id).toBe('tag:grid')
  })

  it('drops corrupt and unsupported envelopes', () => {
    localStorage.setItem(ASSISTANT_PAGE_STATE_STORAGE_KEY, '{')
    expect(readAssistantPageState('/assets/rule')).toMatchObject({ version: 1, messages: [] })

    localStorage.setItem(ASSISTANT_PAGE_STATE_STORAGE_KEY, JSON.stringify({ version: 2, pages: {} }))
    expect(readAssistantPageState('/assets/rule')).toMatchObject({ version: 1, messages: [] })
  })

  it('clears only the requested page', () => {
    patchAssistantPageState('/assets/rule', { messages: [{ id: 'u1', role: 'user', content: 'dark', createdAt: '2026-07-24T00:00:00.000Z' }] })
    patchAssistantPageState('/assets/layout', { messages: [{ id: 'u2', role: 'user', content: 'grid', createdAt: '2026-07-24T00:00:00.000Z' }] })

    clearAssistantPageState('/assets/rule')

    expect(readAssistantPageState('/assets/rule').messages).toEqual([])
    expect(readAssistantPageState('/assets/layout').messages).toHaveLength(1)
  })
})

describe('message snapshots', () => {
  it('round-trips completed text and tool result content', () => {
    const persisted = serializeMessages([{
      id: 'a1',
      role: 'assistant',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
      content: [{
        type: 'tool-call',
        toolCallId: 't1',
        toolName: 'apply_filter',
        args: { add: [], remove: [] },
        argsText: '{"add":[],"remove":[]}',
        result: { success: true, changed: false, matchCount: 21, applied: { add: [], remove: [] } },
      }],
      status: { type: 'complete', reason: 'stop' },
      metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} },
    }])

    expect(restoreMessages(persisted)[0]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: [{ type: 'tool-call', toolName: 'apply_filter', result: { matchCount: 21 } }],
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    })
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/pageState.test.ts
```

Expected: FAIL，提示无法解析 `./pageState`。

- [ ] **Step 3: 实现页面状态模块**

在 `pageState.ts` 定义并实现：

```ts
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
```

补充测试：注入一个 `setItem()` 抛出 `QuotaExceededError` 的 Storage stub，连续 patch
`filter` 和 `messages`，断言两次结果均 `ok === false`，且
`readAssistantPageState(pageKey, stub)` 同时保留两部分内存状态。再调用 clear，断言读取为空，
证明失败的持久化删除不会让旧磁盘值回流。

- [ ] **Step 4: 运行页面状态测试**

Run:

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/pageState.test.ts
```

Expected: PASS，所有页面键、往返、损坏数据和写入失败用例通过。

- [ ] **Step 5: 提交页面状态基础设施**

```bash
git add apps/design/framework/src/shell/assistant/pageState.ts apps/design/framework/src/shell/assistant/pageState.test.ts
git commit -m "feat: add assistant page state store"
```

## Task 2：页面会话协调器与迟到结果门控

**Files:**

- Create: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Create: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantProvider.tsx`

**Interfaces:**

- Consumes: Task 1 的页面键、Store 和消息转换函数；assistant-ui `AssistantRuntime`。
- Produces:
  - `AssistantPageSessionProvider`
  - `useAssistantPageSession(): AssistantPageSessionValue`
  - `createPageScopedModelAdapter(adapter, getEpoch): ChatModelAdapter`
  - `registerResetHandler(handler: () => void): () => void`
  - `setPageFilter(filter: Filter): StoreWriteResult`
  - `startNewChat(): void`

- [ ] **Step 1: 写会话切换的失败测试**

使用一个最小 fake Runtime，而不是 mock React 内部实现：

```tsx
// @vitest-environment jsdom
import { useEffect, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantRuntime, ThreadMessageLike } from '@assistant-ui/react'
import { AssistantPageSessionProvider, useAssistantPageSession } from './pageSession'
import { patchAssistantPageState } from './pageState'

function createRuntime() {
  let messages: ThreadMessageLike[] = []
  let running = false
  const listeners = new Set<() => void>()
  return {
    runtime: {
      thread: {
        getState: () => ({ messages, isRunning: running }),
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        reset: vi.fn((next: ThreadMessageLike[] = []) => {
          messages = next
          listeners.forEach((listener) => listener())
        }),
        cancelRun: vi.fn(() => { running = false }),
      },
    } as unknown as AssistantRuntime,
    setMessages(next: ThreadMessageLike[], isRunning = false) {
      messages = next
      running = isRunning
      listeners.forEach((listener) => listener())
    },
  }
}

describe('AssistantPageSessionProvider', () => {
  beforeEach(() => localStorage.clear())

  it('saves the old route and restores the concrete destination route', () => {
    patchAssistantPageState('/assets/layout', {
      messages: [{ id: 'u2', role: 'user', content: 'grid', createdAt: '2026-07-24T00:00:00.000Z' }],
    })
    const fake = createRuntime()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/assets/rule']}>
        <AssistantPageSessionProvider runtime={fake.runtime}>
          {children}
        </AssistantPageSessionProvider>
      </MemoryRouter>
    )
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), { wrapper })

    act(() => fake.setMessages([{ id: 'u1', role: 'user', content: 'dark', createdAt: new Date() }]))
    act(() => result.current.navigate('/assets/layout'))

    expect(fake.runtime.thread.cancelRun).toHaveBeenCalled()
    expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'u2', content: 'grid' }),
    ])
    expect(result.current.session.pageKey).toBe('/assets/layout')
  })

  it('new chat clears messages, calls the page reset handler, and preserves other pages', () => {
    const fake = createRuntime()
    const resetPage = vi.fn()
    patchAssistantPageState('/assets/rule', {
      messages: [{ id: 'u1', role: 'user', content: 'dark', createdAt: '2026-07-24T00:00:00.000Z' }],
      filter: { chips: [{ id: 'tag:dark', kind: 'tag', label: 'dark', value: 'dark', addedBy: 'ai' }] },
    })
    patchAssistantPageState('/assets/layout', {
      messages: [{ id: 'u2', role: 'user', content: 'grid', createdAt: '2026-07-24T00:00:00.000Z' }],
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/assets/rule']}>
        <AssistantPageSessionProvider runtime={fake.runtime}>
          {children}
        </AssistantPageSessionProvider>
      </MemoryRouter>
    )
    const { result } = renderHook(() => {
      const session = useAssistantPageSession()
      useEffect(
        () => session.registerResetHandler(resetPage),
        [session.registerResetHandler],
      )
      return session
    }, { wrapper })

    act(() => result.current.startNewChat())

    expect(fake.runtime.thread.cancelRun).toHaveBeenCalled()
    expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([])
    expect(resetPage).toHaveBeenCalledTimes(1)
    expect(readAssistantPageState('/assets/rule').messages).toEqual([])
    expect(readAssistantPageState('/assets/rule').filter).toBeUndefined()
    expect(readAssistantPageState('/assets/layout').messages).toHaveLength(1)
  })
})
```

测试文件同时新增以下完整用例：

- 运行中消息不会持久化；
- `pageKey` 改变时 epoch 增加；
- 写入失败时 `persistenceError` 变为英文提示；
- adapter 在 run 开始后的 epoch 改变时停止 yield。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd apps/design
npm run test -- framework/src/shell/assistant/pageSession.test.tsx
```

Expected: FAIL，提示无法解析 `./pageSession`。

- [ ] **Step 3: 实现页面会话 Context 与 Provider**

在 `pageSession.tsx` 实现以下公开类型和行为：

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { AssistantRuntime } from '@assistant-ui/react'
import type { Filter } from '@/lib/ai/filterState'
import {
  clearAssistantPageState,
  createAssistantPageKey,
  patchAssistantPageState,
  readAssistantPageState,
  restoreMessages,
  serializeMessages,
  type AssistantPageStateV1,
} from './pageState'

export type AssistantPageSessionValue = {
  pageKey: string
  pageState: AssistantPageStateV1
  ready: boolean
  hasState: boolean
  persistenceError: string | null
  registerResetHandler: (handler: () => void) => () => void
  setPageFilter: (filter: Filter) => void
  startNewChat: () => void
}

const AssistantPageSessionContext =
  createContext<AssistantPageSessionValue | null>(null)

export function useAssistantPageSession(): AssistantPageSessionValue {
  const value = useContext(AssistantPageSessionContext)
  if (!value) throw new Error('useAssistantPageSession must be used inside AssistantPageSessionProvider')
  return value
}

export function AssistantPageSessionProvider({
  runtime,
  epochRef,
  children,
}: {
  runtime: AssistantRuntime
  epochRef?: MutableRefObject<number>
  children: ReactNode
}) {
  const location = useLocation()
  const pageKey = useMemo(
    () => createAssistantPageKey(location),
    [location.pathname, location.search],
  )
  const internalEpochRef = useRef(0)
  const activeEpochRef = epochRef ?? internalEpochRef
  const activeKeyRef = useRef(pageKey)
  const hydratingRef = useRef(true)
  const resetHandlerRef = useRef<() => void>(() => {})
  const [ready, setReady] = useState(false)
  const [pageState, setPageState] = useState(() =>
    readAssistantPageState(pageKey),
  )
  const [messageCount, setMessageCount] = useState(
    () => runtime.thread.getState().messages.length,
  )
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  const saveSnapshot = useCallback((targetPageKey: string) => {
    const result = patchAssistantPageState(targetPageKey, {
      messages: serializeMessages(runtime.thread.getState().messages),
    })
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
  }, [runtime])

  const saveMessages = useCallback(() => {
    if (hydratingRef.current || runtime.thread.getState().isRunning) return
    saveSnapshot(activeKeyRef.current)
  }, [runtime, saveSnapshot])

  const onThreadChange = useCallback(() => {
    setMessageCount(runtime.thread.getState().messages.length)
    saveMessages()
  }, [runtime, saveMessages])

  useLayoutEffect(() => {
    activeEpochRef.current += 1
    const previousPageKey = activeKeyRef.current
    runtime.thread.cancelRun()
    if (previousPageKey !== pageKey) saveSnapshot(previousPageKey)
    hydratingRef.current = true
    setReady(false)
    const restored = readAssistantPageState(pageKey)
    activeKeyRef.current = pageKey
    const restoredMessages = restoreMessages(restored.messages)
    runtime.thread.reset(restoredMessages)
    setMessageCount(restoredMessages.length)
    setPageState(restored)
    hydratingRef.current = false
    setReady(true)
  }, [activeEpochRef, pageKey, runtime, saveSnapshot])

  useLayoutEffect(
    () => runtime.thread.subscribe(onThreadChange),
    [runtime, onThreadChange],
  )

  const registerResetHandler = useCallback((handler: () => void) => {
    resetHandlerRef.current = handler
    return () => {
      if (resetHandlerRef.current === handler) resetHandlerRef.current = () => {}
    }
  }, [])

  const setPageFilter = useCallback((filter: Filter) => {
    const result = patchAssistantPageState(activeKeyRef.current, { filter })
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
  }, [])

  const startNewChat = useCallback(() => {
    activeEpochRef.current += 1
    hydratingRef.current = true
    runtime.thread.cancelRun()
    runtime.thread.reset([])
    setMessageCount(0)
    resetHandlerRef.current()
    const result = clearAssistantPageState(activeKeyRef.current)
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
    hydratingRef.current = false
  }, [activeEpochRef, runtime])

  const value = useMemo<AssistantPageSessionValue>(() => ({
    pageKey,
    pageState,
    ready,
    hasState: messageCount > 0 || (pageState.filter?.chips.length ?? 0) > 0,
    persistenceError,
    registerResetHandler,
    setPageFilter,
    startNewChat,
  }), [
    pageKey,
    pageState,
    messageCount,
    persistenceError,
    ready,
    registerResetHandler,
    setPageFilter,
    startNewChat,
  ])

  return (
    <AssistantPageSessionContext.Provider value={value}>
      {children}
    </AssistantPageSessionContext.Provider>
  )
}
```

测试必须证明 `saveSnapshot(previousPageKey)` 在 hydration 门控开启前保存旧页面，目标页面
恢复时不会被空 Runtime 快照覆盖。

- [ ] **Step 4: 给 Model Adapter 增加页面代次门控**

在 `AssistantProvider.tsx` 抽出工厂，并让生产 Provider 共享同一个 `epochRef`：

```ts
export function createPageScopedModelAdapter(
  runAdapter: ReturnType<typeof createStreamTextAdapter>,
  getEpoch: () => number,
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal, context, unstable_getMessage }) {
      const epoch = getEpoch()
      const currentMessage = unstable_getMessage()
      const hasCompletedTool = currentMessage.content.some(
        (part) => part.type === 'tool-call' && part.result !== undefined,
      )
      for await (const chunk of runAdapter.run({
        messages: messages as never,
        abortSignal,
        context: context as never,
        currentMessage: hasCompletedTool ? (currentMessage as never) : undefined,
      })) {
        if (getEpoch() !== epoch) return
        yield chunk as unknown as ChatModelRunResult
      }
    },
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const epochRef = useRef(0)
  const modelAdapter = useMemo(
    () => createPageScopedModelAdapter(adapter, () => epochRef.current),
    [],
  )
  const runtime = useLocalRuntime(modelAdapter, { maxSteps: 2 })
  return (
    <AssistantAvailabilityProvider>
      <AssistantPageSessionProvider runtime={runtime} epochRef={epochRef}>
        <AssistantRuntimeProvider runtime={runtime}>
          {children}
        </AssistantRuntimeProvider>
      </AssistantPageSessionProvider>
    </AssistantAvailabilityProvider>
  )
}
```

在 `pageSession.test.tsx` 用一个会 yield 两次的 fake adapter 验证 epoch 改变后第二个 chunk
不会被转发。

- [ ] **Step 5: 运行会话和现有 Provider 相关测试**

Run:

```bash
cd apps/design
npm run test -- \
  framework/src/shell/assistant/pageSession.test.tsx \
  framework/src/shell/assistant/usePageAssistant.test.tsx \
  framework/src/shell/SidebarShell.test.tsx
```

Expected: PASS；无 `act(...)`、未处理 Promise 或 state update warning。

- [ ] **Step 6: 提交会话协调器**

```bash
git add \
  apps/design/framework/src/shell/assistant/pageSession.tsx \
  apps/design/framework/src/shell/assistant/pageSession.test.tsx \
  apps/design/framework/src/shell/assistant/AssistantProvider.tsx
git commit -m "feat: isolate assistant sessions by page"
```

## Task 3：`New chat` 交互与页面重置注册

**Files:**

- Modify: `apps/design/framework/src/shell/assistant/usePageAssistant.ts`
- Modify: `apps/design/framework/src/shell/assistant/usePageAssistant.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantPanel.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantPanel.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/assistant.css`

**Interfaces:**

- Consumes: Task 2 的 `useAssistantPageSession()`。
- Produces:
  - `UsePageAssistantOptions.onResetPageState?: () => void`
  - `AssistantThread({ composerInputRef?: Ref<HTMLTextAreaElement> })`
  - AI 面板标题栏 `New chat`。

- [ ] **Step 1: 写重置注册和面板交互的失败测试**

扩展 `usePageAssistant.test.tsx`：

```tsx
const registerResetHandler = vi.fn(() => vi.fn())

vi.mock('./pageSession', () => ({
  useAssistantPageSession: () => ({ registerResetHandler }),
}))

function Page({ onReset }: { onReset: () => void }) {
  usePageAssistant({
    instructions: 'do filtering',
    available: true,
    onResetPageState: onReset,
  })
  return null
}

it('registers and unregisters the page reset handler', () => {
  const unregister = vi.fn()
  registerResetHandler.mockReturnValue(unregister)
  const onReset = vi.fn()
  const view = render(
    <AssistantAvailabilityProvider>
      <Page onReset={onReset} />
    </AssistantAvailabilityProvider>,
  )
  expect(registerResetHandler).toHaveBeenCalledWith(onReset)
  view.unmount()
  expect(unregister).toHaveBeenCalled()
})
```

扩展 `AssistantPanel.test.tsx`，mock `hasValidConfig` 为 true、mock `confirmTip` 和
`useAssistantPageSession`：

```tsx
it('confirms and starts a new chat when the page has state', async () => {
  confirmTipMock.mockResolvedValue(true)
  session.hasState = true
  renderPanel(true)

  fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

  await waitFor(() => expect(confirmTipMock).toHaveBeenCalledWith({
    message: 'Start a new chat? This clears the conversation and filters for this page.',
    confirmLabel: 'Start new chat',
    danger: false,
  }))
  expect(session.startNewChat).toHaveBeenCalledTimes(1)
})
```

另写三个测试：

- `hasState=false` 时不确认，直接调用 `startNewChat()`；
- 用户取消确认时不清空；
- `persistenceError` 以 `role="status"` 显示。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd apps/design
npm run test -- \
  framework/src/shell/assistant/usePageAssistant.test.tsx \
  framework/src/shell/assistant/AssistantPanel.test.tsx \
  framework/src/shell/assistant/AssistantThread.test.tsx
```

Expected: FAIL，新参数、新按钮和 ref 行为尚不存在。

- [ ] **Step 3: 扩展 `usePageAssistant`**

实现精确接口：

```ts
export type UsePageAssistantOptions = {
  instructions: string
  available?: boolean
  onResetPageState?: () => void
}

export function usePageAssistant({
  instructions,
  available = true,
  onResetPageState,
}: UsePageAssistantOptions): void {
  useAssistantInstructions(instructions)
  const { setAvailable } = useAssistantAvailability()
  const { registerResetHandler } = useAssistantPageSession()

  useEffect(() => {
    setAvailable(available)
    return () => setAvailable(false)
  }, [available, setAvailable])

  useEffect(() => {
    if (!onResetPageState) return
    return registerResetHandler(onResetPageState)
  }, [onResetPageState, registerResetHandler])
}
```

- [ ] **Step 4: 实现面板按钮、确认与焦点恢复**

在 `AssistantPanel.tsx`：

```tsx
const composerInputRef = useRef<HTMLTextAreaElement>(null)
const {
  hasState,
  persistenceError,
  startNewChat,
} = useAssistantPageSession()

async function onNewChat() {
  if (hasState) {
    const confirmed = await confirmTip({
      message: 'Start a new chat? This clears the conversation and filters for this page.',
      confirmLabel: 'Start new chat',
      danger: false,
    })
    if (!confirmed) return
  }
  startNewChat()
  requestAnimationFrame(() => composerInputRef.current?.focus())
}
```

标题栏结构改为：

```tsx
<header className="assistant-panel__header">
  <span>AI Assistant</span>
  <div className="assistant-panel__actions">
    <button
      type="button"
      className="assistant-panel__new-chat"
      onClick={onNewChat}
      aria-label="New chat"
    >
      New chat
    </button>
    <button
      type="button"
      className="assistant-panel__close"
      onClick={onClose}
      aria-label="Close assistant"
      autoFocus={!configured}
    >
      ×
    </button>
  </div>
</header>
```

已配置分支使用 `<AssistantThread composerInputRef={composerInputRef} />`。在面板 body 顶部
加入：

```tsx
{persistenceError ? (
  <p className="assistant-panel__persistence-warning" role="status">
    Your conversation is available for this session but could not be saved.
  </p>
) : null}
```

在 `AssistantThread.tsx` 定义：

```tsx
export function AssistantThread({
  composerInputRef,
}: {
  composerInputRef?: React.Ref<HTMLTextAreaElement>
}) {
  return (
    <ThreadPrimitive.Root className="aui-thread">
      <ThreadPrimitive.Viewport className="aui-thread-viewport">
        <ThreadPrimitive.Empty>
          <p className="aui-thread-empty">
            Describe the design style or layout you need, for example: “A dark finance dashboard with cool colors.”
          </p>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === 'user' ? <UserBubble /> : <AssistantBubble />
          }
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="aui-composer">
        <ComposerPrimitive.Input
          ref={composerInputRef}
          className="aui-composer-input"
          placeholder="Describe what you need…"
          rows={2}
          autoFocus
        />
        <ComposerPrimitive.Send className="aui-composer-send">
          Send
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
```

- [ ] **Step 5: 增加 dashboard 样式**

在 `assistant.css` 使用已有 token，不写新颜色常量：

```css
.assistant-panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.assistant-panel__new-chat {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.assistant-panel__new-chat:hover {
  border-color: var(--color-primary);
  background: var(--color-surface-2);
}

.assistant-panel__new-chat:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.assistant-panel__persistence-warning {
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: 12px;
}
```

这些变量均已由 `framework/src/styles/tokens.css` 定义，不添加局部颜色常量。

- [ ] **Step 6: 运行交互测试**

Run:

```bash
cd apps/design
npm run test -- \
  framework/src/shell/assistant/usePageAssistant.test.tsx \
  framework/src/shell/assistant/AssistantPanel.test.tsx \
  framework/src/shell/assistant/AssistantThread.test.tsx
```

Expected: PASS；确认、取消、空状态、焦点和持久化警告均通过。

- [ ] **Step 7: 提交新聊天交互**

```bash
git add \
  apps/design/framework/src/shell/assistant/usePageAssistant.ts \
  apps/design/framework/src/shell/assistant/usePageAssistant.test.tsx \
  apps/design/framework/src/shell/assistant/AssistantPanel.tsx \
  apps/design/framework/src/shell/assistant/AssistantPanel.test.tsx \
  apps/design/framework/src/shell/assistant/AssistantThread.tsx \
  apps/design/framework/src/shell/assistant/AssistantThread.test.tsx \
  apps/design/framework/src/shell/assistant/assistant.css
git commit -m "feat: add page-scoped new chat action"
```

## Task 4：资产筛选恢复、清理与持久化

**Files:**

- Create: `apps/design/framework/src/features/assets/usePersistentAssetFilter.ts`
- Create: `apps/design/framework/src/features/assets/usePersistentAssetFilter.test.tsx`
- Modify: `apps/design/framework/src/lib/ai/filterState.ts`
- Modify: `apps/design/framework/src/lib/ai/filterState.test.ts`
- Modify: `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
- Modify: `apps/design/framework/src/features/assets/assistantFilterTool.tsx`

**Interfaces:**

- Consumes: Task 2 的 `pageState`、`ready`、`setPageFilter()` 和 Task 3 的重置注册。
- Produces:
  - `sanitizeFilterForIndex(filter: Filter, index: readonly AssetMeta[]): Filter`
  - `usePersistentAssetFilter(index: AssetMeta[] | null): { filter; filterRef; setFilter; resetFilter }`

- [ ] **Step 1: 写筛选清理纯函数的失败测试**

在 `filterState.test.ts` 增加：

```ts
import { sanitizeFilterForIndex } from './filterState'

it('drops stale tag and origin chips but keeps freeform chips', () => {
  const filter = {
    chips: [
      { id: 'tag:dark', kind: 'tag', label: 'dark', value: 'dark', addedBy: 'ai' },
      { id: 'tag:retired', kind: 'tag', label: 'retired', value: 'retired', addedBy: 'ai' },
      { id: 'origin:manual', kind: 'origin', label: 'manual', value: 'manual', addedBy: 'user' },
      { id: 'free:finance', kind: 'freeform', label: 'finance', value: 'finance', addedBy: 'user' },
    ],
  } satisfies Filter
  const index = [{
    id: 'a',
    title: 'Dark',
    summary: '',
    tags: ['dark'],
    origin: 'open-design',
  }] as AssetMeta[]

  expect(sanitizeFilterForIndex(filter, index).chips.map((chip) => chip.id))
    .toEqual(['tag:dark', 'free:finance'])
})
```

- [ ] **Step 2: 写持久化筛选 hook 的失败测试**

`usePersistentAssetFilter.test.tsx` mock `useAssistantPageSession`，覆盖：

```tsx
it('hydrates the page filter only after session and index are ready', () => {
  session.ready = true
  session.pageKey = '/assets/rule'
  session.pageState.filter = {
    chips: [{ id: 'tag:dark', kind: 'tag', label: 'dark', value: 'dark', addedBy: 'ai' }],
  }
  const { result } = renderHook(() => usePersistentAssetFilter(index))

  expect(result.current.filter.chips.map((chip) => chip.id)).toEqual(['tag:dark'])
  expect(session.setPageFilter).toHaveBeenCalledWith(result.current.filter)
})

it('persists functional updates from both AI and manual controls', () => {
  const { result } = renderHook(() => usePersistentAssetFilter(index))
  act(() => result.current.setFilter((previous) => ({
    chips: [...previous.chips, darkChip],
  })))
  expect(result.current.filter.chips).toEqual([darkChip])
  expect(session.setPageFilter).toHaveBeenLastCalledWith({ chips: [darkChip] })
})

it('resets state and filterRef together', () => {
  const { result } = renderHook(() => usePersistentAssetFilter(index))
  act(() => result.current.setFilter({ chips: [darkChip] }))
  act(() => result.current.resetFilter())
  expect(result.current.filter).toEqual({ chips: [] })
  expect(result.current.filterRef.current).toEqual({ chips: [] })
})
```

另加页面键切换测试，证明旧页面 filter 不会被默认空 state 覆盖。

- [ ] **Step 3: 运行测试并确认失败**

Run:

```bash
cd apps/design
npm run test -- \
  framework/src/lib/ai/filterState.test.ts \
  framework/src/features/assets/usePersistentAssetFilter.test.tsx
```

Expected: FAIL，缺少纯函数和 hook。

- [ ] **Step 4: 实现筛选清理函数**

在 `filterState.ts` 增加：

```ts
export function sanitizeFilterForIndex(
  filter: Filter,
  index: readonly AssetMeta[],
): Filter {
  const tags = new Set(index.flatMap((item) => item.tags))
  const origins = new Set(index.map((item) => item.origin))
  return {
    chips: filter.chips.filter((chip) => {
      if (chip.kind === 'freeform') return true
      if (chip.kind === 'tag') return tags.has(chip.value)
      return origins.has(chip.value)
    }),
  }
}
```

从 `./assetIndex` 使用 `import type { AssetMeta }`，避免运行时循环依赖。

- [ ] **Step 5: 实现 `usePersistentAssetFilter`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import {
  emptyFilter,
  sanitizeFilterForIndex,
  type Filter,
} from '@/lib/ai/filterState'
import { useAssistantPageSession } from '@/shell/assistant/pageSession'

type FilterUpdate = Filter | ((previous: Filter) => Filter)

export function usePersistentAssetFilter(index: AssetMeta[] | null) {
  const {
    pageKey,
    pageState,
    ready,
    setPageFilter,
  } = useAssistantPageSession()
  const [filter, setFilterState] = useState<Filter>(emptyFilter)
  const filterRef = useRef(filter)
  const hydratedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || !index || hydratedKeyRef.current === pageKey) return
    const restored = sanitizeFilterForIndex(
      pageState.filter ?? emptyFilter(),
      index,
    )
    hydratedKeyRef.current = pageKey
    filterRef.current = restored
    setFilterState(restored)
    setPageFilter(restored)
  }, [index, pageKey, pageState.filter, ready, setPageFilter])

  const setFilter = useCallback((update: FilterUpdate) => {
    const next =
      typeof update === 'function' ? update(filterRef.current) : update
    filterRef.current = next
    setFilterState(next)
    setPageFilter(next)
  }, [setPageFilter])

  const resetFilter = useCallback(() => {
    const next = emptyFilter()
    filterRef.current = next
    setFilterState(next)
  }, [])

  return { filter, filterRef, setFilter, resetFilter }
}
```

`resetFilter` 不自行写 Store，因为 `startNewChat()` 随后删除整个当前页面状态；手动
`Reset all` 仍通过 `setFilter(emptyFilter())` 持久化。

- [ ] **Step 6: 接入 `AssetBrowserPage`**

替换：

```ts
const [filter, setFilter] = useState<Filter>(emptyFilter())
const filterRef = useRef(filter)
filterRef.current = filter
```

为：

```ts
const {
  filter,
  filterRef,
  setFilter,
  resetFilter,
} = usePersistentAssetFilter(assetIndex)
```

并把页面注册改为：

```ts
usePageAssistant({
  instructions: assistantReady
    ? buildSystemPrompt({
        basePrompt,
        kind,
        filter,
        candidates: applyFilter(assetIndex, filter),
      })
    : '',
  available: assistantReady,
  onResetPageState: resetFilter,
})
```

保持以下调用全部使用 hook 的 `setFilter`：

```tsx
<AssetFilterTool
  index={assetIndex}
  filterRef={filterRef}
  onFilterChange={setFilter}
/>

<AssetFilterChips
  filter={filter}
  onRemove={(id) =>
    setFilter((previous) => ({
      chips: previous.chips.filter((chip) => chip.id !== id),
    }))
  }
  onReset={() => setFilter(emptyFilter())}
/>
```

删除不再使用的 `Filter`、页面内 `useRef(filter)` 等 import。`assistantFilterTool.tsx`
不新增第二套持久化逻辑；它继续只调用注入的 `onFilterChange`。

- [ ] **Step 7: 运行筛选相关测试**

Run:

```bash
cd apps/design
npm run test -- \
  framework/src/lib/ai/filterState.test.ts \
  framework/src/features/assets/usePersistentAssetFilter.test.tsx \
  framework/src/features/assets/assistantFilterTool.test.tsx \
  framework/src/features/assets/AssetFilterChips.test.tsx
```

Expected: PASS；连续工具 delta、手动 chip、恢复和 reset 全部通过。

- [ ] **Step 8: 提交资产筛选持久化**

```bash
git add \
  apps/design/framework/src/lib/ai/filterState.ts \
  apps/design/framework/src/lib/ai/filterState.test.ts \
  apps/design/framework/src/features/assets/usePersistentAssetFilter.ts \
  apps/design/framework/src/features/assets/usePersistentAssetFilter.test.tsx \
  apps/design/framework/src/features/assets/AssetBrowserPage.tsx \
  apps/design/framework/src/features/assets/assistantFilterTool.tsx
git commit -m "feat: persist asset filters per page"
```

## Task 5：锁定 prompt 到页面更新的完整链路

**Files:**

- Create: `apps/design/framework/src/features/assets/assistantFiltering.integration.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/streamTextAdapter.ts`
- Modify: `apps/design/framework/src/shell/assistant/AssistantProvider.tsx`
- Modify: `apps/design/framework/src/features/assets/assistantFilterTool.tsx`

**Interfaces:**

- Consumes: `createStreamTextAdapter`、Task 2 的 adapter 工厂、`AssetFilterTool` 和 Task 4 的持久化 setter。
- Produces: 一个真实 LocalRuntime 集成测试，证明 composer 输入导致 `apply_filter` 执行和资产 UI 更新。

- [ ] **Step 1: 写完整链路失败测试**

测试使用真实 `useLocalRuntime`、`AssistantRuntimeProvider`、`AssistantThread` 和
`AssetFilterTool`。仅 mock AI SDK 的 `streamTextImpl`：

```tsx
// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { describe, expect, it } from 'vitest'
import { applyFilter, emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { AssistantThread } from '@/shell/assistant/AssistantThread'
import { createStreamTextAdapter } from '@/shell/assistant/streamTextAdapter'
import { AssetFilterTool } from './assistantFilterTool'

const index: AssetMeta[] = [
  { id: 'dark', title: 'Dark dashboard', summary: '', tags: ['dark'], origin: 'manual', hasPreview: true },
  { id: 'light', title: 'Light dashboard', summary: '', tags: ['light'], origin: 'manual', hasPreview: true },
]

function Harness() {
  const [filter, setFilter] = useState<Filter>(emptyFilter())
  const filterRef = useRef(filter)
  filterRef.current = filter
  const adapter = createStreamTextAdapter({
    readConfig: () => ({
      provider: 'openai',
      apiKey: 'test',
      model: 'test',
      baseURL: 'https://example.test/v1',
    }),
    createModelImpl: () => ({}) as never,
    streamTextImpl: (options) => {
      const tools = options.tools as Record<string, {
        execute?: (
          args: unknown,
          options: {
            toolCallId: string
            messages: []
            abortSignal: AbortSignal
          },
        ) => Promise<unknown>
      }>
      return {
        fullStream: (async function* () {
          const args = {
            add: [{ kind: 'tag' as const, label: 'dark', value: 'dark' }],
            remove: [],
          }
          yield { type: 'tool-call', toolCallId: 't1', toolName: 'apply_filter', args }
          const result = await tools.apply_filter!.execute!(
            args,
            {
              toolCallId: 't1',
              messages: [],
              abortSignal: new AbortController().signal,
            },
          )
          yield { type: 'tool-result', toolCallId: 't1', toolName: 'apply_filter', result }
          yield { type: 'text-delta', textDelta: 'Applied dark.' }
          yield { type: 'finish', finishReason: 'stop' }
        })(),
      }
    },
  })
  const modelAdapter: ChatModelAdapter = {
    run: adapter.run as ChatModelAdapter['run'],
  }
  const runtime = useLocalRuntime(modelAdapter, { maxSteps: 2 })
  const visible = applyFilter(index, filter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssetFilterTool index={index} filterRef={filterRef} onFilterChange={setFilter} />
      <output aria-label="active filters">
        {filter.chips.map((chip) => chip.label).join(',')}
      </output>
      <output aria-label="match count">{visible.length}</output>
      <ul aria-label="visible assets">
        {visible.map((item) => <li key={item.id}>{item.title}</li>)}
      </ul>
      <AssistantThread />
    </AssistantRuntimeProvider>
  )
}

describe('assistant filtering integration', () => {
  it('updates chips, count, and visible assets after a clear prompt', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByPlaceholderText('Describe what you need…'), {
      target: { value: 'Show dark designs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByLabelText('active filters').textContent).toBe('dark')
      expect(screen.getByLabelText('match count').textContent).toBe('1')
      expect(screen.getByLabelText('visible assets').textContent).toContain('Dark dashboard')
      expect(screen.getByLabelText('visible assets').textContent).not.toContain('Light dashboard')
    })
  })
})
```

该测试不得降级成直接调用 `applyFilterExecute()`；必须保留 composer 输入、真实
LocalRuntime、adapter 工具转发和三个用户可见断言。

- [ ] **Step 2: 运行测试并确认当前行为**

Run:

```bash
cd apps/design
npm run test -- framework/src/features/assets/assistantFiltering.integration.test.tsx
```

Expected: FAIL，至少一个 chips、数量或可见资产断言不成立，复现用户报告的完整链路问题。

- [ ] **Step 3: 修复测试揭示的最小链路缺口**

把 `streamTextAdapter.ts` 的工具转换固定为以下实现：

```ts
export function buildTools(tools: AdapterContext['tools']) {
  if (!tools) return undefined
  const out: Record<string, unknown> = {}
  for (const [name, definition] of Object.entries(tools)) {
    const execute = definition.execute
      ? async (args: unknown, options: ToolExecutionOptions) =>
          definition.execute!(args, {
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
    const shared = {
      description: definition.description ?? '',
      parameters: toAiToolParameters(definition.parameters) as never,
    }
    out[name] = execute
      ? aiTool({ ...shared, execute })
      : aiTool(shared)
  }
  return out
}
```

在 `AssistantProvider.tsx` 保留以下续步逻辑：

```ts
const currentMessage = unstable_getMessage()
const hasCompletedTool = currentMessage.content.some(
  (part) => part.type === 'tool-call' && part.result !== undefined,
)

for await (const chunk of runAdapter.run({
  messages: messages as never,
  abortSignal,
  context: context as never,
  currentMessage: hasCompletedTool ? (currentMessage as never) : undefined,
})) {
  if (getEpoch() !== epoch) return
  yield chunk as unknown as ChatModelRunResult
}
```

在 `assistantFilterTool.tsx` 保持先写 ref、再更新页面的顺序：

```ts
if (changed) {
  ctx.filterRef.current = next
  try {
    ctx.onFilterChange(next)
  } catch (error) {
    ctx.filterRef.current = previous
    throw error
  }
}
```

若以上实现已经存在，使用集成测试证明它们共同生效，不进行格式化或无意义重写。

- [ ] **Step 4: 运行完整 assistant 与资产测试**

Run:

```bash
cd apps/design
npm run test -- \
  framework/src/features/assets/assistantFiltering.integration.test.tsx \
  framework/src/features/assets/assistantFilterTool.test.tsx \
  framework/src/shell/assistant/streamTextAdapter.test.ts \
  framework/src/shell/assistant/AssistantThread.test.tsx
```

Expected: PASS；没有未处理流、重复工具执行或 React warning。

- [ ] **Step 5: 提交完整链路保障**

```bash
git add \
  apps/design/framework/src/features/assets/assistantFiltering.integration.test.tsx \
  apps/design/framework/src/shell/assistant/streamTextAdapter.ts \
  apps/design/framework/src/shell/assistant/AssistantProvider.tsx \
  apps/design/framework/src/features/assets/assistantFilterTool.tsx
git commit -m "test: cover assistant-driven asset filtering"
```

提交前只 stage 实际变更的文件；若三个实现文件没有变化，不要把它们加入提交。

## Task 6：公共文档、完整验证与浏览器冒烟

**Files:**

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Review: `apps/design/framework/src/styles/tokens.css`
- Review: all files changed in Tasks 1–5

**Interfaces:**

- Consumes: Tasks 1–5 的最终公开行为。
- Produces: 与实现一致的 assistant 页面会话公共文档和验证证据。

- [ ] **Step 1: 更新公共 API 文档**

在 `docs/dev/api/assistant-ui-chat.md` 增加以下明确契约：

```markdown
## 页面级会话

- Shell 继续使用一个 LocalRuntime，但当前 Runtime 只装载当前 `pageKey` 的消息。
- `pageKey` 由具体 pathname 和白名单查询参数生成；当前白名单为 `appId`。
- 页面切换先保存旧稳定消息、取消旧运行，再恢复目标页面消息。
- 消息与资产筛选写入 `localStorage['wn.assistant.page-state.v1']`，结构带 `version: 1`。
- 存储损坏或不可用时，当前会话退化为内存模式，不阻断聊天。
- 运行中消息不持久化；恢复消息保留已完成工具结果。

## `usePageAssistant(options)` 页面重置

```ts
usePageAssistant({
  instructions: string,
  available?: boolean,
  onResetPageState?: () => void,
})
```

- `onResetPageState` 注册当前页面业务状态的同步清理函数，卸载时自动注销。
- `New chat` 取消当前运行、清空 Runtime、调用该回调并删除当前页面持久化状态。
- 资产页回调必须同时清空 React filter state 和 `filterRef`。

## 筛选集成验收

明确筛选 prompt 只有在 `apply_filter` 工具真实执行后才算更新成功。验收必须观察 chips、
匹配数量和可见资产三者变化，普通助手文本不得修改筛选。
```

按现有文档结构合并内容，不重复已有 `apply_filter` 契约。

- [ ] **Step 2: 运行格式与定向测试**

Run:

```bash
git diff --check
cd apps/design
npm run test -- \
  framework/src/shell/assistant/pageState.test.ts \
  framework/src/shell/assistant/pageSession.test.tsx \
  framework/src/shell/assistant/usePageAssistant.test.tsx \
  framework/src/shell/assistant/AssistantPanel.test.tsx \
  framework/src/features/assets/usePersistentAssetFilter.test.tsx \
  framework/src/features/assets/assistantFiltering.integration.test.tsx
```

Expected: `git diff --check` 无输出；所有定向测试 PASS。

- [ ] **Step 3: 运行完整测试**

Run:

```bash
cd apps/design
npm run test
```

Expected: Vitest 全部 PASS，无 unhandled rejection、React `act` warning 或新增控制台错误。

- [ ] **Step 4: 运行生产构建**

Run:

```bash
cd apps/design
npm run build
```

Expected: TypeScript 和 Vite build 成功；修改文件无 warning。

- [ ] **Step 5: 启动应用并完成浏览器冒烟**

Run:

```bash
cd apps/design
npm run dev -- --host 127.0.0.1
```

在浏览器依次验证：

- `/assets/rule` 输入明确 dark prompt 后出现 chip，数量和资产卡片同步变化；
- 切换 `/assets/layout`，不显示 Rule 的聊天或筛选；
- 在 Layout 建立另一段聊天和筛选，切回 Rule 后恢复原状态；
- 刷新 Rule 和 Layout 均恢复各自状态；
- 带不同 `appId` 的资产地址使用独立状态；
- `New chat` 在有状态时显示确认，取消保持原状态，确认后聊天和筛选同时清空；
- 确认清空后刷新不会恢复旧状态；
- AI 生成中切页，旧回复和旧工具结果不出现在新页面；
- 桌面和窄屏、light 和 dark theme 下按钮、提示、焦点和布局均正常；
- 键盘聚焦 `New chat`、确认并清空后，焦点回到 composer。

- [ ] **Step 6: 提交文档**

```bash
git add docs/dev/api/assistant-ui-chat.md
git commit -m "docs: document page-scoped assistant sessions"
```

- [ ] **Step 7: 最终工作区检查**

Run:

```bash
git status --short
git log --oneline -7
```

Expected: 只保留任务开始前已存在、明确不属于本计划的未跟踪文件；提交历史包含六个边界清晰的提交。

## 完成定义

- Rule、Layout、每个 App 和 Canvas 地址拥有独立聊天。
- `appId` 查询上下文隔离，临时 UI 查询参数不产生重复会话。
- 页面离开、刷新和浏览器重启后恢复聊天与筛选。
- 存储损坏或容量不足不阻断当前内存会话。
- 页面切换取消旧运行，迟到 chunk 不进入新页面。
- `New chat` 原子地清空当前页面聊天、筛选和本地状态，不影响其他页面。
- 明确 prompt 通过真实 `apply_filter` 工具更新 chips、数量和资产内容。
- 公共文档、定向测试、完整测试、生产构建和浏览器冒烟全部通过。

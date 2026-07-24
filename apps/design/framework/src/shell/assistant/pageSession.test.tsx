// @vitest-environment jsdom
import {
  useEffect,
  useLayoutEffect,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type AssistantRuntime,
  type ChatModelRunResult,
  type ThreadHistoryAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import type { Filter } from '@/lib/ai/filterState'
import {
  AssistantPageSessionProvider,
  useAssistantPageSession,
} from './pageSession'
import {
  patchAssistantPageState,
  readAssistantPageState,
} from './pageState'
import { createPageScopedModelAdapter } from './AssistantProvider'

function createRuntime({
  asyncCancellation = false,
  rejectNonEmptyReset = false,
}: {
  asyncCancellation?: boolean
  rejectNonEmptyReset?: boolean
} = {}) {
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
          if (rejectNonEmptyReset && next.length > 0) {
            throw new Error('Runtime rejected restored messages')
          }
          messages = next
          listeners.forEach((listener) => listener())
        }),
        cancelRun: vi.fn(() => {
          if (!asyncCancellation) running = false
        }),
      },
    } as unknown as AssistantRuntime,
    setMessages(next: ThreadMessageLike[], isRunning = false) {
      messages = next
      running = isRunning
      listeners.forEach((listener) => listener())
    },
    finishRun() {
      running = false
      listeners.forEach((listener) => listener())
    },
  }
}

function createWrapper(
  fake: ReturnType<typeof createRuntime>,
  initialEntry: string,
  epochRef?: MutableRefObject<number>,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <AssistantPageSessionProvider
          runtime={fake.runtime}
          epochRef={epochRef}
        >
          {children}
        </AssistantPageSessionProvider>
      </MemoryRouter>
    )
  }
}

const noOpAdapter: ChatModelAdapter = {
  async *run() {},
}

type LocalRuntimeControl = {
  runtime: AssistantRuntime | null
  threadStates: Array<{
    isLoading: boolean
    messageCount: number
  }>
  resolveHistory: () => void
}

function createLocalRuntimeWrapper(
  initialEntry: string,
  control: LocalRuntimeControl,
) {
  let resolveHistory: (
    repository: Awaited<ReturnType<ThreadHistoryAdapter['load']>>,
  ) => void = () => {}
  const history: ThreadHistoryAdapter = {
    load: vi.fn(() => new Promise<
      Awaited<ReturnType<ThreadHistoryAdapter['load']>>
    >((resolve) => {
      resolveHistory = resolve
    })),
    append: vi.fn(async () => {}),
  }
  control.resolveHistory = () => resolveHistory({ messages: [] })

  function RuntimeLoadingProbe({ runtime }: { runtime: AssistantRuntime }) {
    useLayoutEffect(() => {
      const recordLoading = () => {
        const state = runtime.thread.getState()
        control.threadStates.push({
          isLoading: state.isLoading,
          messageCount: state.messages.length,
        })
      }
      recordLoading()
      return runtime.thread.subscribe(recordLoading)
    }, [runtime])
    return null
  }

  return function Wrapper({ children }: { children: ReactNode }) {
    const runtime = useLocalRuntime(noOpAdapter, {
      adapters: { history },
    })
    control.runtime = runtime
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <RuntimeLoadingProbe runtime={runtime} />
          <AssistantPageSessionProvider runtime={runtime}>
            {children}
          </AssistantPageSessionProvider>
        </MemoryRouter>
      </AssistantRuntimeProvider>
    )
  }
}

function createModelRunInput(
  abortSignal: AbortSignal,
  context: Record<string, unknown> = {},
) {
  return {
    messages: [],
    runConfig: {},
    abortSignal,
    context,
    unstable_getMessage: () => ({
      id: 'a1',
      role: 'assistant',
      content: [],
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
      status: { type: 'complete', reason: 'stop' },
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {},
      },
    }),
  }
}

function controlBrowserStorage() {
  const values = new Map<string, string>()
  let getterAvailable = true
  let writesFail = false
  const durableStorage: Storage = {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      if (writesFail) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      values.set(key, value)
    },
  }
  const getter = vi.spyOn(window, 'localStorage', 'get')
    .mockImplementation(() => {
      if (!getterAvailable) {
        throw new DOMException('access denied', 'SecurityError')
      }
      return durableStorage
    })

  return {
    hasDurablePage(pageKey: string) {
      const raw = values.get('wn.assistant.page-state.v1')
      if (!raw) return false
      const parsed = JSON.parse(raw) as {
        pages?: Record<string, unknown>
      }
      return parsed.pages?.[pageKey] !== undefined
    },
    setGetterAvailable(value: boolean) {
      getterAvailable = value
    },
    setWritesFail(value: boolean) {
      writesFail = value
    },
    restore() {
      getter.mockRestore()
    },
  }
}

describe('AssistantPageSessionProvider', () => {
  beforeEach(() => localStorage.clear())

  it('saves the old route before restoring the concrete destination route', () => {
    patchAssistantPageState('/assets/layout', {
      messages: [{
        id: 'u2',
        role: 'user',
        content: 'grid',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/assets/rule'),
    })

    act(() => fake.setMessages([{
      id: 'u1',
      role: 'user',
      content: 'dark',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.navigate('/assets/layout'))

    expect(fake.runtime.thread.cancelRun).toHaveBeenCalled()
    expect(readAssistantPageState('/assets/rule').messages).toEqual([
      expect.objectContaining({ id: 'u1', content: 'dark' }),
    ])
    expect(readAssistantPageState('/assets/layout').messages).toEqual([
      expect.objectContaining({ id: 'u2', content: 'grid' }),
    ])
    expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'u2', content: 'grid' }),
    ])
    expect(result.current.session.pageKey).toBe('/assets/layout')
  })

  it('does not persist running messages but reports their state immediately', () => {
    const fake = createRuntime()
    const { result } = renderHook(useAssistantPageSession, {
      wrapper: createWrapper(fake, '/running-state'),
    })

    act(() => fake.setMessages([{
      id: 'running',
      role: 'user',
      content: 'not finished',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))

    expect(result.current.hasState).toBe(true)
    expect(readAssistantPageState('/running-state').messages).toEqual([])
  })

  it('increments the shared epoch when the concrete page key changes', () => {
    const fake = createRuntime()
    const epochRef = { current: 0 }
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/assets/rule', epochRef),
    })
    const initialEpoch = epochRef.current

    act(() => result.current.navigate('/assets/layout'))

    expect(result.current.session.pageKey).toBe('/assets/layout')
    expect(epochRef.current).toBe(initialEpoch + 1)
  })

  it('waits for an asynchronous run cancellation before resetting the destination', () => {
    patchAssistantPageState('/async-destination', {
      messages: [{
        id: 'destination',
        role: 'user',
        content: 'destination',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime({ asyncCancellation: true })
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/async-source'),
    })
    const resetCountBeforeNavigation =
      vi.mocked(fake.runtime.thread.reset).mock.calls.length

    act(() => fake.setMessages([{
      id: 'source',
      role: 'user',
      content: 'source',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.navigate('/async-destination'))

    expect(fake.runtime.thread.reset).toHaveBeenCalledTimes(
      resetCountBeforeNavigation,
    )
    expect(result.current.session.ready).toBe(false)

    act(() => fake.finishRun())

    expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'destination' }),
    ])
    expect(result.current.session.ready).toBe(true)
  })

  it('clears a page cache and becomes ready when runtime restore fails', () => {
    patchAssistantPageState('/restore-failure', {
      messages: [{
        id: 'valid-store-message',
        role: 'user',
        content: 'cannot restore',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime({ rejectNonEmptyReset: true })

    const { result } = renderHook(useAssistantPageSession, {
      wrapper: createWrapper(fake, '/restore-failure'),
    })

    expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([])
    expect(result.current.ready).toBe(true)
    expect(result.current.pageState.messages).toEqual([])
    expect(readAssistantPageState('/restore-failure').messages).toEqual([])
  })

  it('never exposes a new page key with old state marked ready', () => {
    patchAssistantPageState('/ready-source', {
      messages: [{
        id: 'source-state',
        role: 'user',
        content: 'source',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    patchAssistantPageState('/ready-destination', {
      messages: [{
        id: 'destination-state',
        role: 'user',
        content: 'destination',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime()
    const observed: Array<{
      pageKey: string
      ready: boolean
      messageId: string | undefined
    }> = []
    const { result } = renderHook(() => {
      const session = useAssistantPageSession()
      observed.push({
        pageKey: session.pageKey,
        ready: session.ready,
        messageId: session.pageState.messages[0]?.id,
      })
      return {
        session,
        navigate: useNavigate(),
      }
    }, {
      wrapper: createWrapper(fake, '/ready-source'),
    })

    act(() => result.current.navigate('/ready-destination'))

    expect(observed).not.toContainEqual({
      pageKey: '/ready-destination',
      ready: true,
      messageId: 'source-state',
    })
  })

  it('keeps one logical page overlay visible across storage identity changes', () => {
    const storage = controlBrowserStorage()
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/continuity-a'),
    })

    try {
      storage.setWritesFail(true)
      act(() => {
        result.current.session.setPageFilter(result.current.session.owner, {
          chips: [{
            id: 'tag:dark',
            kind: 'tag',
            label: 'dark',
            value: 'dark',
            addedBy: 'ai',
          }],
        })
      })

      storage.setWritesFail(false)
      storage.setGetterAvailable(false)
      act(() => fake.setMessages([{
        id: 'outage-message',
        role: 'user',
        content: 'outage',
        createdAt: new Date('2026-07-24T00:00:00.000Z'),
      }]))
      act(() => result.current.navigate('/continuity-b'))
      act(() => result.current.navigate('/continuity-a'))

      expect(result.current.session.ready).toBe(true)
      expect(result.current.session.pageState).toMatchObject({
        messages: [expect.objectContaining({ id: 'outage-message' })],
        filter: {
          chips: [expect.objectContaining({ id: 'tag:dark' })],
        },
      })
      expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: 'outage-message' }),
      ])
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/continuity-a')
      storage.restore()
    }
  })

  it('does not snapshot provisional empty messages when the getter is unavailable', () => {
    const storage = controlBrowserStorage()
    patchAssistantPageState('/provisional-getter-b', {
      messages: [{
        id: 'durable-b',
        role: 'user',
        content: 'durable',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/provisional-getter-a'),
    })

    try {
      storage.setGetterAvailable(false)
      act(() => result.current.navigate('/provisional-getter-b'))
      expect(result.current.session.pageState.messages).toEqual([])

      act(() => result.current.navigate('/provisional-getter-c'))
      storage.setGetterAvailable(true)

      expect(
        readAssistantPageState('/provisional-getter-b').messages,
      ).toEqual([
        expect.objectContaining({ id: 'durable-b' }),
      ])
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/provisional-getter-b')
      storage.restore()
    }
  })

  it('ignores real LocalRuntime mount loading notifications for provisional empty messages', async () => {
    const storage = controlBrowserStorage()
    patchAssistantPageState('/provisional-local-runtime', {
      messages: [{
        id: 'durable-local-runtime',
        role: 'user',
        content: 'durable',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    storage.setGetterAvailable(false)
    const control: LocalRuntimeControl = {
      runtime: null,
      threadStates: [],
      resolveHistory: () => {},
    }
    try {
      const { result } = renderHook(() => ({
        session: useAssistantPageSession(),
        navigate: useNavigate(),
      }), {
        wrapper: createLocalRuntimeWrapper(
          '/provisional-local-runtime',
          control,
        ),
      })
      expect(result.current.session.pageState.messages).toEqual([])
      await waitFor(() => {
        expect(control.threadStates).toContainEqual({
          isLoading: true,
          messageCount: 0,
        })
      })
      act(() => control.resolveHistory())
      await waitFor(() => {
        expect(control.threadStates.at(-1)).toEqual({
          isLoading: false,
          messageCount: 0,
        })
      })

      act(() => result.current.navigate('/after-local-runtime-load'))
      storage.setGetterAvailable(true)

      expect(
        readAssistantPageState('/provisional-local-runtime').messages,
      ).toEqual([
        expect.objectContaining({ id: 'durable-local-runtime' }),
      ])
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/provisional-local-runtime')
      storage.restore()
    }
  })

  it('persists the first real LocalRuntime user message from a provisional page', async () => {
    const storage = controlBrowserStorage()
    patchAssistantPageState('/provisional-local-message', {
      messages: [{
        id: 'old-local-runtime',
        role: 'user',
        content: 'old',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    storage.setGetterAvailable(false)
    const control: LocalRuntimeControl = {
      runtime: null,
      threadStates: [],
      resolveHistory: () => {},
    }
    try {
      const { result } = renderHook(() => ({
        session: useAssistantPageSession(),
        navigate: useNavigate(),
      }), {
        wrapper: createLocalRuntimeWrapper(
          '/provisional-local-message',
          control,
        ),
      })
      await waitFor(() => {
        expect(control.threadStates).toContainEqual({
          isLoading: true,
          messageCount: 0,
        })
      })
      act(() => control.resolveHistory())
      await waitFor(() => {
        expect(control.threadStates.at(-1)).toEqual({
          isLoading: false,
          messageCount: 0,
        })
      })

      act(() => {
        control.runtime!.thread.append({
          role: 'user',
          content: [{ type: 'text', text: 'outage-created' }],
          startRun: false,
        })
      })
      await waitFor(() => {
        expect(result.current.session.pageState.messages).toEqual([
          expect.objectContaining({
            role: 'user',
            content: [{ type: 'text', text: 'outage-created' }],
          }),
        ])
      })
      act(() => result.current.navigate('/after-local-runtime-message'))
      storage.setGetterAvailable(true)

      expect(
        readAssistantPageState('/provisional-local-message').messages,
      ).toEqual([
        expect.objectContaining({
          role: 'user',
          content: [{ type: 'text', text: 'outage-created' }],
        }),
      ])
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/provisional-local-message')
      storage.restore()
    }
  })

  it('does not snapshot provisional empty messages when migration cannot write', () => {
    const storage = controlBrowserStorage()
    patchAssistantPageState('/provisional-migration-b', {
      messages: [{
        id: 'durable-migration-b',
        role: 'user',
        content: 'durable',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/provisional-migration-a'),
    })

    try {
      storage.setWritesFail(true)
      act(() => {
        result.current.session.setPageFilter(result.current.session.owner, {
          chips: [{
            id: 'tag:dirty',
            kind: 'tag',
            label: 'dirty',
            value: 'dirty',
            addedBy: 'ai',
          }],
        })
      })
      act(() => result.current.navigate('/provisional-migration-b'))
      expect(result.current.session.pageState.messages).toEqual([])

      act(() => result.current.navigate('/provisional-migration-c'))
      storage.setWritesFail(false)

      expect(
        readAssistantPageState('/provisional-migration-b').messages,
      ).toEqual([
        expect.objectContaining({ id: 'durable-migration-b' }),
      ])
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/provisional-migration-b')
      storage.restore()
    }
  })

  it('persists genuine message changes from a provisional page', () => {
    const storage = controlBrowserStorage()
    patchAssistantPageState('/provisional-message-b', {
      messages: [{
        id: 'old-durable',
        role: 'user',
        content: 'old',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/provisional-message-a'),
    })

    try {
      storage.setGetterAvailable(false)
      act(() => result.current.navigate('/provisional-message-b'))
      act(() => fake.setMessages([{
        id: 'outage-created',
        role: 'user',
        content: 'new',
        createdAt: new Date('2026-07-24T00:00:00.000Z'),
      }]))
      act(() => result.current.navigate('/provisional-message-c'))
      storage.setGetterAvailable(true)

      expect(
        readAssistantPageState('/provisional-message-b').messages,
      ).toEqual([
        expect.objectContaining({ id: 'outage-created' }),
      ])
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/provisional-message-b')
      storage.restore()
    }
  })

  it('keeps a New chat tombstone from provisional hydration', () => {
    const storage = controlBrowserStorage()
    patchAssistantPageState('/provisional-clear-b', {
      messages: [{
        id: 'clear-durable',
        role: 'user',
        content: 'clear',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/provisional-clear-a'),
    })

    try {
      storage.setGetterAvailable(false)
      act(() => result.current.navigate('/provisional-clear-b'))
      act(() => {
        result.current.session.startNewChat(result.current.session.owner)
      })
      act(() => result.current.navigate('/provisional-clear-c'))
      storage.setGetterAvailable(true)

      expect(readAssistantPageState('/provisional-clear-b').messages).toEqual([])
      expect(storage.hasDurablePage('/provisional-clear-b')).toBe(false)
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/provisional-clear-b')
      storage.restore()
    }
  })

  it('rejects new chat while destination hydration is pending', () => {
    patchAssistantPageState('/pending-destination', {
      messages: [{
        id: 'destination',
        role: 'user',
        content: 'destination',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime({ asyncCancellation: true })
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/pending-source'),
    })

    act(() => fake.setMessages([{
      id: 'source',
      role: 'user',
      content: 'source',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.navigate('/pending-destination'))
    let accepted: boolean | undefined
    act(() => {
      accepted = result.current.session.startNewChat(
        result.current.session.owner,
      )
    })
    act(() => fake.finishRun())

    expect(accepted).toBe(false)
    expect(result.current.session.pageKey).toBe('/pending-destination')
    expect(result.current.session.ready).toBe(true)
    expect(readAssistantPageState('/pending-destination').messages).toEqual([
      expect.objectContaining({ id: 'destination' }),
    ])
    expect(readAssistantPageState('/pending-source').messages).toEqual([
      expect.objectContaining({ id: 'source' }),
    ])
  })

  it('finishes clearing the source page when navigation happens before idle', () => {
    patchAssistantPageState('/clear-source', {
      messages: [{
        id: 'source-cached',
        role: 'user',
        content: 'source cached',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
      filter: {
        chips: [{
          id: 'tag:source',
          kind: 'tag',
          label: 'source',
          value: 'source',
          addedBy: 'user',
        }],
      },
    })
    patchAssistantPageState('/clear-destination', {
      messages: [{
        id: 'destination-cached',
        role: 'user',
        content: 'destination cached',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
      filter: {
        chips: [{
          id: 'tag:destination',
          kind: 'tag',
          label: 'destination',
          value: 'destination',
          addedBy: 'user',
        }],
      },
    })
    patchAssistantPageState('/clear-other', {
      messages: [{
        id: 'other-cached',
        role: 'user',
        content: 'other cached',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime({ asyncCancellation: true })
    const resetPage = vi.fn()
    const { result } = renderHook(() => {
      const session = useAssistantPageSession()
      useEffect(
        () => session.registerResetHandler(resetPage),
        [session.registerResetHandler],
      )
      return {
        session,
        navigate: useNavigate(),
      }
    }, {
      wrapper: createWrapper(fake, '/clear-source'),
    })

    act(() => fake.setMessages([{
      id: 'source-running',
      role: 'user',
      content: 'source running',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.session.startNewChat(
      result.current.session.owner,
    ))
    act(() => result.current.navigate('/clear-destination'))
    act(() => fake.finishRun())

    expect(readAssistantPageState('/clear-source').messages).toEqual([])
    expect(readAssistantPageState('/clear-source').filter).toBeUndefined()
    expect(readAssistantPageState('/clear-destination')).toMatchObject({
      messages: [expect.objectContaining({ id: 'destination-cached' })],
      filter: {
        chips: [expect.objectContaining({ id: 'tag:destination' })],
      },
    })
    expect(readAssistantPageState('/clear-other').messages).toEqual([
      expect.objectContaining({ id: 'other-cached' }),
    ])
    expect(result.current.session.pageKey).toBe('/clear-destination')
    expect(result.current.session.ready).toBe(true)
    expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'destination-cached' }),
    ])
    expect(resetPage).not.toHaveBeenCalled()
  })

  it('rejects a stale new-chat owner after navigation', () => {
    patchAssistantPageState('/stale-destination', {
      messages: [{
        id: 'destination',
        role: 'user',
        content: 'destination',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
      filter: {
        chips: [{
          id: 'tag:destination',
          kind: 'tag',
          label: 'destination',
          value: 'destination',
          addedBy: 'user',
        }],
      },
    })
    const fake = createRuntime({ asyncCancellation: true })
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/stale-source'),
    })
    const staleOwner = result.current.session.owner

    act(() => fake.setMessages([{
      id: 'source',
      role: 'user',
      content: 'source',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.navigate('/stale-destination'))
    act(() => fake.finishRun())
    let accepted: boolean | undefined
    act(() => {
      accepted = result.current.session.startNewChat(staleOwner)
    })

    expect(accepted).toBe(false)
    expect(result.current.session.pageKey).toBe('/stale-destination')
    expect(result.current.session.ready).toBe(true)
    expect(readAssistantPageState('/stale-destination')).toMatchObject({
      messages: [expect.objectContaining({ id: 'destination' })],
    })
    expect(readAssistantPageState('/stale-destination').filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:destination' })],
    })
    expect(readAssistantPageState('/stale-source').messages).toEqual([
      expect.objectContaining({ id: 'source' }),
    ])
  })

  it('writes filters to the latest route while its runtime hydration is pending', () => {
    patchAssistantPageState('/filter-source', {
      filter: {
        chips: [{
          id: 'tag:source',
          kind: 'tag',
          label: 'source',
          value: 'source',
          addedBy: 'user',
        }],
      },
    })
    const fake = createRuntime({ asyncCancellation: true })
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/filter-source'),
    })

    act(() => fake.setMessages([{
      id: 'source',
      role: 'user',
      content: 'source',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.navigate('/filter-destination'))
    expect(result.current.session.ready).toBe(false)

    act(() => {
      result.current.session.setPageFilter(result.current.session.owner, {
        chips: [{
          id: 'tag:destination',
          kind: 'tag',
          label: 'destination',
          value: 'destination',
          addedBy: 'ai',
        }],
      })
    })

    expect(readAssistantPageState('/filter-destination').filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:destination' })],
    })
    expect(readAssistantPageState('/filter-source').filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:source' })],
    })

    act(() => fake.finishRun())
  })

  it('rejects a filter mutation owned by a page that is no longer current', () => {
    patchAssistantPageState('/owner-source', {
      filter: {
        chips: [{
          id: 'tag:source',
          kind: 'tag',
          label: 'source',
          value: 'source',
          addedBy: 'user',
        }],
      },
    })
    patchAssistantPageState('/owner-destination', {
      filter: {
        chips: [{
          id: 'tag:destination',
          kind: 'tag',
          label: 'destination',
          value: 'destination',
          addedBy: 'user',
        }],
      },
    })
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/owner-source'),
    })
    const sourceOwner = result.current.session.owner

    act(() => result.current.navigate('/owner-destination'))
    let writeResult:
      | ReturnType<typeof result.current.session.setPageFilter>
      | undefined
    act(() => {
      writeResult = result.current.session.setPageFilter(sourceOwner, {
        chips: [{
          id: 'tag:late',
          kind: 'tag',
          label: 'late',
          value: 'late',
          addedBy: 'ai',
        }],
      })
    })

    expect(writeResult).toMatchObject({
      accepted: false,
      ok: false,
      error: 'Filter update ignored because its page is no longer active.',
    })
    expect(readAssistantPageState('/owner-source').filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:source' })],
    })
    expect(readAssistantPageState('/owner-destination').filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:destination' })],
    })
    expect(result.current.session.persistenceError).toBeNull()
  })

  it('rejects a filter mutation from the previous generation after same-page New chat', () => {
    const fake = createRuntime()
    const { result } = renderHook(useAssistantPageSession, {
      wrapper: createWrapper(fake, '/same-page-generation'),
    })
    type Owner = { pageKey: string; generation: number }
    const sessionWithOwner = result.current as typeof result.current & {
      owner?: Owner
    }
    const owner = sessionWithOwner.owner
    const setOwnedFilter = result.current.setPageFilter as unknown as (
      owner: Owner | undefined,
      filter: Filter,
    ) => ReturnType<typeof result.current.setPageFilter>

    expect(owner).toEqual({
      pageKey: '/same-page-generation',
      generation: expect.any(Number),
    })

    act(() => result.current.startNewChat(result.current.owner))
    let writeResult: ReturnType<typeof result.current.setPageFilter> | undefined
    act(() => {
      writeResult = setOwnedFilter(owner, {
        chips: [{
          id: 'tag:late',
          kind: 'tag',
          label: 'late',
          value: 'late',
          addedBy: 'ai',
        }],
      })
    })

    expect(writeResult).toMatchObject({ accepted: false, ok: false })
    expect(readAssistantPageState('/same-page-generation').filter).toBeUndefined()
  })

  it('rejects an old A owner after navigating A to B to A', () => {
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/aba-a'),
    })
    type Owner = { pageKey: string; generation: number }
    const sourceOwner = (
      result.current.session as typeof result.current.session & {
        owner?: Owner
      }
    ).owner

    act(() => result.current.navigate('/aba-b'))
    act(() => result.current.navigate('/aba-a'))
    const currentOwner = (
      result.current.session as typeof result.current.session & {
        owner?: Owner
      }
    ).owner
    let writeResult: ReturnType<
      typeof result.current.session.setPageFilter
    > | undefined
    act(() => {
      writeResult = (
        result.current.session.setPageFilter as unknown as (
          owner: Owner | undefined,
          filter: Filter,
        ) => ReturnType<typeof result.current.session.setPageFilter>
      )(sourceOwner, {
        chips: [{
          id: 'tag:late-a',
          kind: 'tag',
          label: 'late A',
          value: 'late-a',
          addedBy: 'ai',
        }],
      })
    })

    expect(sourceOwner?.pageKey).toBe('/aba-a')
    expect(currentOwner?.pageKey).toBe('/aba-a')
    expect(currentOwner?.generation).not.toBe(sourceOwner?.generation)
    expect(writeResult).toMatchObject({ accepted: false, ok: false })
    expect(readAssistantPageState('/aba-a').filter).toBeUndefined()
  })

  it('returns a failed filter write and exposes its English persistence error', () => {
    const fake = createRuntime()
    const { result } = renderHook(useAssistantPageSession, {
      wrapper: createWrapper(fake, '/storage-failure'),
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })

    try {
      let writeResult: ReturnType<typeof result.current.setPageFilter>
      act(() => {
        writeResult = result.current.setPageFilter(result.current.owner, {
          chips: [{
            id: 'tag:dark',
            kind: 'tag',
            label: 'dark',
            value: 'dark',
            addedBy: 'ai',
          }],
        })
      })

      expect(writeResult!.ok).toBe(false)
      expect(result.current.persistenceError).toBe(
        'Conversation could not be saved.',
      )
    } finally {
      setItem.mockRestore()
    }
  })

  it('clears an old persistence error after recovered migration hydration', () => {
    const storage = controlBrowserStorage()
    const fake = createRuntime({ asyncCancellation: true })
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/warning-source'),
    })

    try {
      storage.setWritesFail(true)
      let writeResult:
        | ReturnType<typeof result.current.session.setPageFilter>
        | undefined
      act(() => {
        writeResult = result.current.session.setPageFilter(
          result.current.session.owner,
          {
            chips: [{
              id: 'tag:warning',
              kind: 'tag',
              label: 'warning',
              value: 'warning',
              addedBy: 'ai',
            }],
          },
        )
      })
      expect(writeResult).toMatchObject({ accepted: true, ok: false })
      expect(result.current.session.persistenceError).toBeTruthy()

      act(() => fake.setMessages([{
        id: 'warning-message',
        role: 'user',
        content: 'warning',
        createdAt: new Date('2026-07-24T00:00:00.000Z'),
      }], true))
      storage.setGetterAvailable(false)
      act(() => result.current.navigate('/warning-destination'))
      expect(result.current.session.ready).toBe(false)

      storage.setWritesFail(false)
      storage.setGetterAvailable(true)
      act(() => fake.finishRun())

      expect(result.current.session.ready).toBe(true)
      expect(result.current.session.persistenceError).toBeNull()
      expect(
        readAssistantPageState('/warning-source').filter,
      ).toEqual({
        chips: [expect.objectContaining({ id: 'tag:warning' })],
      })
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/warning-source')
      storage.restore()
    }
  })

  it('keeps a persistence error through provisional fallback hydration', () => {
    const storage = controlBrowserStorage()
    const fake = createRuntime()
    const { result } = renderHook(() => ({
      session: useAssistantPageSession(),
      navigate: useNavigate(),
    }), {
      wrapper: createWrapper(fake, '/warning-provisional-source'),
    })

    try {
      storage.setWritesFail(true)
      act(() => {
        result.current.session.setPageFilter(result.current.session.owner, {
          chips: [{
            id: 'tag:warning',
            kind: 'tag',
            label: 'warning',
            value: 'warning',
            addedBy: 'ai',
          }],
        })
      })
      expect(result.current.session.persistenceError).toBeTruthy()

      storage.setGetterAvailable(false)
      act(() => result.current.navigate('/warning-provisional-target'))

      expect(result.current.session.ready).toBe(true)
      expect(result.current.session.persistenceError).toBeTruthy()
    } finally {
      storage.setGetterAvailable(true)
      storage.setWritesFail(false)
      readAssistantPageState('/warning-provisional-target')
      storage.restore()
    }
  })

  it('new chat cancels the run, clears this page, and preserves other pages', () => {
    const fake = createRuntime({ asyncCancellation: true })
    const resetPage = vi.fn()
    patchAssistantPageState('/assets/rule', {
      messages: [{
        id: 'u1',
        role: 'user',
        content: 'dark',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
      filter: {
        chips: [{
          id: 'tag:dark',
          kind: 'tag',
          label: 'dark',
          value: 'dark',
          addedBy: 'ai',
        }],
      },
    })
    patchAssistantPageState('/assets/layout', {
      messages: [{
        id: 'u2',
        role: 'user',
        content: 'grid',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const { result } = renderHook(() => {
      const session = useAssistantPageSession()
      useEffect(
        () => session.registerResetHandler(resetPage),
        [session.registerResetHandler],
      )
      return session
    }, {
      wrapper: createWrapper(fake, '/assets/rule'),
    })

    act(() => fake.setMessages([{
      id: 'running',
      role: 'user',
      content: 'running',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.startNewChat(result.current.owner))

    expect(fake.runtime.thread.cancelRun).toHaveBeenCalled()
    expect(fake.runtime.thread.reset).not.toHaveBeenLastCalledWith([])
    expect(result.current.ready).toBe(false)

    act(() => fake.finishRun())

    expect(fake.runtime.thread.reset).toHaveBeenLastCalledWith([])
    expect(resetPage).toHaveBeenCalledTimes(1)
    expect(readAssistantPageState('/assets/rule').messages).toEqual([])
    expect(readAssistantPageState('/assets/rule').filter).toBeUndefined()
    expect(readAssistantPageState('/assets/layout').messages).toHaveLength(1)
    expect(result.current.hasState).toBe(false)
  })

  it('restores ready state and snapshot persistence when the page reset handler throws', () => {
    patchAssistantPageState('/reset-handler-failure', {
      messages: [{
        id: 'before-reset',
        role: 'user',
        content: 'before',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    })
    const fake = createRuntime()
    const resetPage = vi.fn(() => {
      throw new Error('page reset failed')
    })
    const { result } = renderHook(() => {
      const session = useAssistantPageSession()
      useEffect(
        () => session.registerResetHandler(resetPage),
        [session.registerResetHandler],
      )
      return session
    }, {
      wrapper: createWrapper(fake, '/reset-handler-failure'),
    })

    expect(() => {
      act(() => result.current.startNewChat(result.current.owner))
    }).not.toThrow()

    expect(result.current.ready).toBe(true)
    expect(result.current.hasState).toBe(false)
    expect(readAssistantPageState('/reset-handler-failure')).toMatchObject({
      messages: [],
    })

    act(() => fake.setMessages([{
      id: 'after-reset',
      role: 'user',
      content: 'after',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }]))
    expect(readAssistantPageState('/reset-handler-failure').messages).toEqual([
      expect.objectContaining({ id: 'after-reset' }),
    ])
  })

  it('keeps the page empty and persistence warning visible when clear is not durable', () => {
    patchAssistantPageState('/clear-write-failure', {
      messages: [{
        id: 'cached-message',
        role: 'user',
        content: 'cached',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
      filter: {
        chips: [{
          id: 'tag:cached',
          kind: 'tag',
          label: 'cached',
          value: 'cached',
          addedBy: 'user',
        }],
      },
    })
    const fake = createRuntime()
    const { result, rerender } = renderHook(useAssistantPageSession, {
      wrapper: createWrapper(fake, '/clear-write-failure'),
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })

    try {
      act(() => result.current.startNewChat(result.current.owner))

      expect(result.current.ready).toBe(true)
      expect(result.current.hasState).toBe(false)
      expect(result.current.persistenceError).toBeTruthy()
      expect(readAssistantPageState('/clear-write-failure')).toMatchObject({
        messages: [],
      })
      expect(
        readAssistantPageState('/clear-write-failure').filter,
      ).toBeUndefined()

      rerender()
      expect(result.current.persistenceError).toBeTruthy()
    } finally {
      setItem.mockRestore()
    }
  })
})

describe('createPageScopedModelAdapter', () => {
  it('stops yielding when the page epoch changes during a run', async () => {
    let releaseSecondChunk = () => {}
    const waitForRelease = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve
    })
    const first = {
      content: [{ type: 'text' as const, text: 'first' }],
    }
    const second = {
      content: [{ type: 'text' as const, text: 'second' }],
    }
    const runAdapter = {
      async *run() {
        yield first
        await waitForRelease
        yield second
      },
    } as unknown as Parameters<typeof createPageScopedModelAdapter>[0]
    let epoch = 1
    const scoped = createPageScopedModelAdapter(runAdapter, () => epoch)
    const iterator = scoped.run(createModelRunInput(
      new AbortController().signal,
    ) as never) as AsyncGenerator<ChatModelRunResult, void>

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: first,
    })

    epoch += 1
    releaseSecondChunk()

    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    })
  })

  it('does not start a tool after its page epoch becomes stale', async () => {
    let releaseTool = () => {}
    const toolGate = new Promise<void>((resolve) => {
      releaseTool = resolve
    })
    let markRunReady = () => {}
    const runReady = new Promise<void>((resolve) => {
      markRunReady = resolve
    })
    type ToolContext = {
      tools?: Record<string, {
        execute?: (
          args: unknown,
          context: {
            toolCallId: string
            abortSignal: AbortSignal
            human: (payload: unknown) => Promise<unknown>
          },
        ) => unknown
      }>
    }
    const runAdapter = {
      async *run({ context }: { context?: ToolContext }) {
        markRunReady()
        await toolGate
        await context?.tools?.apply_filter.execute?.({}, {
          toolCallId: 't1',
          abortSignal: new AbortController().signal,
          human: async () => undefined,
        })
        yield { content: [{ type: 'text' as const, text: 'late' }] }
      },
    } as unknown as Parameters<typeof createPageScopedModelAdapter>[0]
    const execute = vi.fn()
    let epoch = 1
    const scoped = createPageScopedModelAdapter(runAdapter, () => epoch)
    const iterator = scoped.run(createModelRunInput(
      new AbortController().signal,
      {
        tools: {
          apply_filter: {
            execute,
          },
        },
      },
    ) as never) as AsyncGenerator<ChatModelRunResult, void>

    const pending = iterator.next()
    await runReady
    epoch += 1
    releaseTool()

    await expect(pending).resolves.toEqual({
      done: true,
      value: undefined,
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('settles promptly when an executing tool ignores abort', async () => {
    let releaseExecute = (_value: unknown) => {}
    const ignoredExecute = new Promise<unknown>((resolve) => {
      releaseExecute = resolve
    })
    let markExecuteStarted = () => {}
    const executeStarted = new Promise<void>((resolve) => {
      markExecuteStarted = resolve
    })
    type ToolContext = {
      tools?: Record<string, {
        execute?: (
          args: unknown,
          context: {
            toolCallId: string
            abortSignal: AbortSignal
            human: (payload: unknown) => Promise<unknown>
          },
        ) => unknown
      }>
    }
    const runAdapter = {
      async *run({ context }: { context?: ToolContext }) {
        await context?.tools?.slow_tool.execute?.({}, {
          toolCallId: 't1',
          abortSignal: new AbortController().signal,
          human: async () => undefined,
        })
        yield { content: [{ type: 'text' as const, text: 'late' }] }
      },
    } as unknown as Parameters<typeof createPageScopedModelAdapter>[0]
    const execute = vi.fn(() => {
      markExecuteStarted()
      return ignoredExecute
    })
    const controller = new AbortController()
    const scoped = createPageScopedModelAdapter(runAdapter, () => 1)
    const iterator = scoped.run(createModelRunInput(
      controller.signal,
      {
        tools: {
          slow_tool: {
            execute,
          },
        },
      },
    ) as never) as AsyncGenerator<ChatModelRunResult, void>
    const pending = iterator.next()

    await executeStarted
    controller.abort()
    let settled:
      | IteratorResult<ChatModelRunResult, void>
      | undefined
    void pending.then((result) => {
      settled = result
    })
    try {
      await vi.waitFor(() => {
        expect(settled).toEqual({ done: true, value: undefined })
      }, { timeout: 100, interval: 1 })
    } finally {
      releaseExecute({ success: false })
    }
  })
})

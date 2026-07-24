// @vitest-environment jsdom
import {
  useEffect,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssistantRuntime,
  ChatModelRunResult,
  ThreadMessageLike,
} from '@assistant-ui/react'
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
}: {
  asyncCancellation?: boolean
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

  it('new chat during pending navigation clears the destination page', () => {
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
    act(() => result.current.session.startNewChat())
    act(() => fake.finishRun())

    expect(result.current.session.pageKey).toBe('/pending-destination')
    expect(result.current.session.ready).toBe(true)
    expect(readAssistantPageState('/pending-destination').messages).toEqual([])
    expect(readAssistantPageState('/pending-source').messages).toEqual([
      expect.objectContaining({ id: 'source' }),
    ])
  })

  it('a stale new-chat callback targets the latest pending destination', () => {
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
    const staleStartNewChat = result.current.session.startNewChat

    act(() => fake.setMessages([{
      id: 'source',
      role: 'user',
      content: 'source',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
    }], true))
    act(() => result.current.navigate('/stale-destination'))
    act(() => staleStartNewChat())
    act(() => fake.finishRun())

    expect(result.current.session.pageKey).toBe('/stale-destination')
    expect(result.current.session.ready).toBe(true)
    expect(readAssistantPageState('/stale-destination')).toMatchObject({
      messages: [],
    })
    expect(readAssistantPageState('/stale-destination').filter).toBeUndefined()
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
      result.current.session.setPageFilter({
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
        writeResult = result.current.setPageFilter({
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
    act(() => result.current.startNewChat())

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
    const iterator = scoped.run({
      messages: [],
      runConfig: {},
      abortSignal: new AbortController().signal,
      context: {},
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
    } as never) as AsyncGenerator<ChatModelRunResult, void>

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
})

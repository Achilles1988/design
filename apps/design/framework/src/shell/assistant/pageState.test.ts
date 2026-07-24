// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ASSISTANT_PAGE_STATE_STORAGE_KEY,
  clearAssistantPageState,
  createAssistantPageKey,
  patchAssistantPageState,
  readAssistantPageState,
  restoreMessages,
  serializeMessages,
} from './pageState'

function createStorageView(
  values: Map<string, string>,
  setItem: (key: string, value: string) => void = (key, value) => {
    values.set(key, value)
  },
): Storage {
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem,
  }
}

describe('createAssistantPageKey', () => {
  it('separates concrete routes and keeps only the first trimmed appId', () => {
    expect(createAssistantPageKey({
      pathname: '/apps/a/canvases/home/',
      search: '?view=grid&appId=%20b%20&appId=a',
    })).toBe('/apps/a/canvases/home?appId=b')
    expect(createAssistantPageKey({
      pathname: '/apps/b',
      search: '',
    })).toBe('/apps/b')
  })

  it('does not share a page key when duplicate appIds are reversed', () => {
    expect(createAssistantPageKey({
      pathname: '/assets/rule',
      search: '?appId=a&appId=b',
    })).toBe('/assets/rule?appId=a')
    expect(createAssistantPageKey({
      pathname: '/assets/rule',
      search: '?appId=b&appId=a',
    })).toBe('/assets/rule?appId=b')
  })

  it('matches a null page context when the first appId is empty', () => {
    expect(createAssistantPageKey({
      pathname: '/assets/rule',
      search: '?appId=%20%20&appId=a',
    })).toBe('/assets/rule')
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

  it.each([
    ['a null assistant part', 'assistant', [null]],
    ['a text part without text', 'assistant', [{ type: 'text' }]],
    ['a tool-call on a user message', 'user', [{
      type: 'tool-call',
      toolCallId: 't1',
      toolName: 'apply_filter',
      args: {},
    }]],
    ['a tool-call without a tool name', 'assistant', [{
      type: 'tool-call',
      toolCallId: 't1',
      args: {},
    }]],
    ['a tool-call with a non-string id', 'assistant', [{
      type: 'tool-call',
      toolCallId: 42,
      toolName: 'apply_filter',
      args: {},
    }]],
    ['a tool-call with non-object args', 'assistant', [{
      type: 'tool-call',
      toolCallId: 't1',
      toolName: 'apply_filter',
      args: [],
    }]],
  ])('removes a page containing %s without deleting healthy pages', (
    _description,
    role,
    content,
  ) => {
    localStorage.setItem(ASSISTANT_PAGE_STATE_STORAGE_KEY, JSON.stringify({
      version: 1,
      pages: {
        '/invalid': {
          version: 1,
          messages: [{
            id: 'broken',
            role,
            content,
            createdAt: '2026-07-24T00:00:00.000Z',
          }],
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
        '/healthy': {
          version: 1,
          messages: [{
            id: 'healthy',
            role: 'user',
            content: 'hello',
            createdAt: '2026-07-24T00:00:00.000Z',
          }],
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
      },
    }))

    expect(readAssistantPageState('/invalid').messages).toEqual([])
    expect(readAssistantPageState('/healthy').messages).toEqual([
      expect.objectContaining({ id: 'healthy' }),
    ])
    const persisted = JSON.parse(
      localStorage.getItem(ASSISTANT_PAGE_STATE_STORAGE_KEY) ?? 'null',
    ) as { pages: Record<string, unknown> }
    expect(persisted.pages).not.toHaveProperty('/invalid')
    expect(persisted.pages).toHaveProperty('/healthy')
  })

  it('clears only the requested page', () => {
    patchAssistantPageState('/assets/rule', {
      messages: [{ id: 'u1', role: 'user', content: 'dark', createdAt: '2026-07-24T00:00:00.000Z' }],
      filter: { chips: [{ id: 'tag:dark', kind: 'tag', label: 'dark', value: 'dark', addedBy: 'ai' }] },
    })
    patchAssistantPageState('/assets/layout', { messages: [{ id: 'u2', role: 'user', content: 'grid', createdAt: '2026-07-24T00:00:00.000Z' }] })

    clearAssistantPageState('/assets/rule')

    expect(readAssistantPageState('/assets/rule').messages).toEqual([])
    expect(readAssistantPageState('/assets/rule').filter).toBeUndefined()
    expect(readAssistantPageState('/assets/layout').messages).toHaveLength(1)
  })

  it('keeps failed writes in memory and clears the in-memory page', () => {
    const values = new Map<string, string>()
    const storage: Storage = {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => values.delete(key),
      setItem: () => { throw new DOMException('quota exceeded', 'QuotaExceededError') },
    }

    const filterResult = patchAssistantPageState('/assets/rule', {
      filter: { chips: [{ id: 'tag:dark', kind: 'tag', label: 'dark', value: 'dark', addedBy: 'ai' }] },
    }, storage)
    const messagesResult = patchAssistantPageState('/assets/rule', {
      messages: [{ id: 'u1', role: 'user', content: 'dark', createdAt: '2026-07-24T00:00:00.000Z' }],
    }, storage)

    expect(filterResult.ok).toBe(false)
    expect(messagesResult.ok).toBe(false)
    expect(readAssistantPageState('/assets/rule', storage)).toMatchObject({
      filter: { chips: [{ id: 'tag:dark' }] },
      messages: [{ id: 'u1' }],
    })

    clearAssistantPageState('/assets/rule', storage)

    expect(readAssistantPageState('/assets/rule', storage)).toMatchObject({ messages: [] })
  })

  it('retries every dirty page when a later page write succeeds', () => {
    const values = new Map<string, string>()
    let attempts = 0
    const storage = createStorageView(values, (key, value) => {
      attempts += 1
      if (attempts === 1) throw new Error('first write failed')
      values.set(key, value)
    })

    const first = patchAssistantPageState('/page-a', {
      filter: {
        chips: [{
          id: 'tag:dark',
          kind: 'tag',
          label: 'dark',
          value: 'dark',
          addedBy: 'ai',
        }],
      },
    }, storage)
    const second = patchAssistantPageState('/page-b', {
      messages: [{
        id: 'b-message',
        role: 'user',
        content: 'hello',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    }, storage)

    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
    const reloadedStorage = createStorageView(values)
    expect(readAssistantPageState('/page-a', reloadedStorage).filter).toEqual({
      chips: [expect.objectContaining({ id: 'tag:dark' })],
    })
    expect(readAssistantPageState('/page-b', reloadedStorage).messages).toEqual([
      expect.objectContaining({ id: 'b-message' }),
    ])
  })

  it('retries a failed clear tombstone when a later page write succeeds', () => {
    const values = new Map<string, string>([[
      ASSISTANT_PAGE_STATE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        pages: {
          '/page-a': {
            version: 1,
            messages: [{
              id: 'stale-a',
              role: 'user',
              content: 'stale',
              createdAt: '2026-07-24T00:00:00.000Z',
            }],
            updatedAt: '2026-07-24T00:00:00.000Z',
          },
        },
      }),
    ]])
    let attempts = 0
    const storage = createStorageView(values, (key, value) => {
      attempts += 1
      if (attempts === 1) throw new Error('first write failed')
      values.set(key, value)
    })

    const cleared = clearAssistantPageState('/page-a', storage)
    expect(cleared.ok).toBe(false)
    expect(readAssistantPageState('/page-a', storage).messages).toEqual([])

    const later = patchAssistantPageState('/page-b', {
      messages: [{
        id: 'b-message',
        role: 'user',
        content: 'hello',
        createdAt: '2026-07-24T00:00:00.000Z',
      }],
    }, storage)

    expect(later.ok).toBe(true)
    const reloadedStorage = createStorageView(values)
    expect(readAssistantPageState('/page-a', reloadedStorage).messages).toEqual([])
    expect(readAssistantPageState('/page-b', reloadedStorage).messages).toEqual([
      expect.objectContaining({ id: 'b-message' }),
    ])
  })

  it('reports volatile fallback writes and clears as non-durable', () => {
    const localStorageAccess = vi.spyOn(window, 'localStorage', 'get')
      .mockImplementation(() => {
        throw new DOMException('access denied', 'SecurityError')
      })

    try {
      const patched = patchAssistantPageState('/volatile', {
        messages: [{
          id: 'volatile-message',
          role: 'user',
          content: 'hello',
          createdAt: '2026-07-24T00:00:00.000Z',
        }],
      })
      expect(patched).toMatchObject({
        ok: false,
        error: 'Browser storage is unavailable.',
      })
      expect(readAssistantPageState('/volatile').messages).toEqual([
        expect.objectContaining({ id: 'volatile-message' }),
      ])

      const cleared = clearAssistantPageState('/volatile')
      expect(cleared).toMatchObject({
        ok: false,
        error: 'Browser storage is unavailable.',
      })
      expect(readAssistantPageState('/volatile').messages).toEqual([])
    } finally {
      localStorageAccess.mockRestore()
    }
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

  it('does not persist a tool result that is not JSON serializable', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    const persisted = serializeMessages([{
      id: 'unsafe-tool-result',
      role: 'assistant',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
      content: [{
        type: 'tool-call',
        toolCallId: 't1',
        toolName: 'apply_filter',
        args: {},
        argsText: '{}',
        result: cyclic,
      }],
      status: { type: 'complete', reason: 'stop' },
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {},
      },
    }])

    expect(persisted).toEqual([])
  })
})

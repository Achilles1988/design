// @vitest-environment jsdom
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

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { Reply } from '@/lib/ai/schema'
import { useAssetSearchAgent } from './useAssetSearchAgent'

const INDEX: AssetMeta[] = [
  { id: 'neon', title: 'Neon', summary: 'glow dark', tags: ['spec'], origin: 'open-design', hasPreview: true },
  { id: 'apple', title: 'Apple', summary: 'photography', tags: ['spec'], origin: 'awesome-design-md', hasPreview: false },
]

function reply(partial: Partial<Reply>): Reply {
  return {
    is_relevant: true,
    reply: 'ok',
    filter_delta: { add: [], remove: [] },
    ...partial,
  }
}

function setup(overrides?: {
  sendTurn?: (typeof import('@/lib/ai/client'))['runAssetSearchTurn']
  filter?: Filter
}) {
  const onFilterChange = vi.fn()
  let currentFilter = overrides?.filter ?? emptyFilter()
  onFilterChange.mockImplementation((next: Filter) => {
    currentFilter = next
  })
  const hook = renderHook(({ filter }) =>
    useAssetSearchAgent({
      kind: 'designmd',
      index: INDEX,
      filter,
      onFilterChange,
      basePrompt: '# base',
      sendTurn: overrides?.sendTurn,
    }),
    { initialProps: { filter: currentFilter } },
  )
  return {
    hook,
    onFilterChange,
    currentFilter: () => currentFilter,
    rerender: () => hook.rerender({ filter: currentFilter }),
  }
}

describe('useAssetSearchAgent', () => {
  it('applies filter_delta on relevant reply', async () => {
    const sendTurn = vi.fn().mockResolvedValue(
      reply({
        reply: '建议 spec',
        filter_delta: { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      }),
    )
    const { hook, onFilterChange } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('给我风格建议')
    })
    expect(onFilterChange).toHaveBeenCalledTimes(1)
    const passed = onFilterChange.mock.calls[0]![0] as Filter
    expect(passed.chips.map((c) => c.id)).toEqual(['tag:spec'])
    expect(hook.result.current.entries).toHaveLength(2)
    expect(hook.result.current.entries[1]!.kind).toBe('normal')
  })

  it('does NOT apply filter_delta when is_relevant is false', async () => {
    const sendTurn = vi.fn().mockResolvedValue(
      reply({
        is_relevant: false,
        reply: '我只筛资产',
        filter_delta: { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      }),
    )
    const { hook, onFilterChange } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('今天天气如何')
    })
    expect(onFilterChange).not.toHaveBeenCalled()
    expect(hook.result.current.entries[1]!.kind).toBe('relevance-rejected')
  })

  it('records error entry on failure without wiping messages', async () => {
    const sendTurn = vi.fn().mockRejectedValue(new Error('401 Unauthorized: bad api key'))
    const { hook } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('hi')
    })
    const entries = hook.result.current.entries
    expect(entries).toHaveLength(2)
    expect(entries[0]!.role).toBe('user')
    expect(entries[1]!.kind).toBe('error')
    expect(entries[1]!.content.toLowerCase()).toContain('unauthor')
  })

  it('clear() resets entries', async () => {
    const sendTurn = vi.fn().mockResolvedValue(reply({}))
    const { hook } = setup({ sendTurn })
    await act(async () => {
      await hook.result.current.ask('hi')
    })
    expect(hook.result.current.entries).toHaveLength(2)
    act(() => {
      hook.result.current.clear()
    })
    expect(hook.result.current.entries).toHaveLength(0)
  })
})

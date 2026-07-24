// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { AssetMeta } from '@/lib/ai/assetIndex'

const registeredTool = vi.hoisted(() => ({
  current: null as null | {
    execute: (args: {
      add: Array<{
        kind: 'tag' | 'origin' | 'freeform'
        label: string
        value: string
      }>
      remove: string[]
    }) => Promise<unknown>
  },
}))

vi.mock('@assistant-ui/react', () => ({
  useAssistantTool: (tool: typeof registeredTool.current) => {
    registeredTool.current = tool
  },
}))

import {
  applyFilterExecute,
  applyFilterSafely,
  AssetFilterTool,
} from './assistantFilterTool'

const index = [
  { id: 'a', title: 'Dark board', summary: '', tags: ['dark'], origin: 'x' },
  { id: 'b', title: 'Light board', summary: '', tags: ['light'], origin: 'x' },
] as unknown as AssetMeta[]

describe('applyFilterExecute', () => {
  it('merges delta, calls onFilterChange, and returns matchCount', () => {
    let current: Filter = emptyFilter()
    const onFilterChange = vi.fn((f: Filter) => {
      current = f
    })
    const filterRef = { current }
    const res = applyFilterExecute(
      { add: [{ kind: 'tag', label: 'dark', value: 'dark' }], remove: [] },
      { index, filterRef, onFilterChange },
    )
    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(res.matchCount).toBe(1)
    expect(res.applied.add).toHaveLength(1)
  })

  it('accumulates consecutive deltas against the latest filter before rerender', () => {
    const filterRef = { current: emptyFilter() }
    const onFilterChange = vi.fn()

    applyFilterExecute(
      { add: [{ kind: 'tag', label: 'dark', value: 'dark' }], remove: [] },
      { index, filterRef, onFilterChange },
    )
    const second = applyFilterExecute(
      { add: [{ kind: 'origin', label: 'x', value: 'x' }], remove: [] },
      { index, filterRef, onFilterChange },
    )

    expect(filterRef.current.chips.map((chip) => chip.id)).toEqual([
      'tag:dark',
      'origin:x',
    ])
    expect(second.changed).toBe(true)
    expect(onFilterChange).toHaveBeenLastCalledWith(filterRef.current)
  })

  it('removes a prior chip in a later turn', () => {
    const filterRef = { current: emptyFilter() }
    const onFilterChange = vi.fn()

    applyFilterExecute(
      { add: [{ kind: 'tag', label: 'dark', value: 'dark' }], remove: [] },
      { index, filterRef, onFilterChange },
    )
    const result = applyFilterExecute(
      { add: [], remove: ['tag:dark', 'tag:missing'] },
      { index, filterRef, onFilterChange },
    )

    expect(filterRef.current.chips).toEqual([])
    expect(result.applied).toEqual({ add: [], remove: ['tag:dark'] })
  })

  it('reports only operations that actually changed the filter', () => {
    const filterRef = { current: emptyFilter() }
    applyFilterExecute(
      { add: [{ kind: 'tag', label: 'dark', value: 'dark' }], remove: [] },
      { index, filterRef, onFilterChange: vi.fn() },
    )

    const result = applyFilterExecute(
      {
        add: [
          { kind: 'tag', label: 'dark', value: 'dark' },
          { kind: 'origin', label: 'x', value: 'x' },
        ],
        remove: ['tag:missing'],
      },
      { index, filterRef, onFilterChange: vi.fn() },
    )

    expect(result.applied).toEqual({
      add: [{ kind: 'origin', label: 'x', value: 'x' }],
      remove: [],
    })
  })

  it('returns a structured failure and preserves the current filter', () => {
    const filterRef = { current: emptyFilter() }
    const result = applyFilterSafely(
      { add: [{ kind: 'tag', label: 'dark', value: 'dark' }], remove: [] },
      {
        index,
        filterRef,
        onFilterChange: () => {
          throw new Error('State update failed')
        },
      },
    )

    expect(result).toEqual({
      success: false,
      applied: { add: [], remove: [] },
      matchCount: 2,
      changed: false,
      error: 'State update failed',
    })
    expect(filterRef.current).toEqual(emptyFilter())
  })

  it('rolls back the filter ref when the page owner rejects the update', () => {
    const filterRef = { current: emptyFilter() }
    const result = applyFilterSafely(
      { add: [{ kind: 'tag', label: 'dark', value: 'dark' }], remove: [] },
      {
        index,
        filterRef,
        onFilterChange: () => false,
      },
    )

    expect(result).toEqual({
      success: false,
      applied: { add: [], remove: [] },
      matchCount: 2,
      changed: false,
      error: 'Filter update ignored because its page is no longer active.',
    })
    expect(filterRef.current).toEqual(emptyFilter())
  })

  it('reports no change for an empty delta', () => {
    const filterRef = { current: emptyFilter() }
    const onFilterChange = vi.fn()
    const res = applyFilterExecute(
      { add: [], remove: [] },
      { index, filterRef, onFilterChange },
    )

    expect(res.matchCount).toBe(2)
    expect(res.changed).toBe(false)
    expect(onFilterChange).not.toHaveBeenCalled()
  })

  it('keeps the source owner on an execute captured before rerender', async () => {
    const filterRef = { current: emptyFilter() }
    const onFilterChange = vi.fn(() => true)
    const { rerender } = render(
      <AssetFilterTool
        index={index}
        filterRef={filterRef}
        owner={{ pageKey: '/owner-source', generation: 1 }}
        onFilterChange={onFilterChange}
      />,
    )
    const sourceExecute = registeredTool.current!.execute

    rerender(
      <AssetFilterTool
        index={index}
        filterRef={filterRef}
        owner={{ pageKey: '/owner-destination', generation: 2 }}
        onFilterChange={onFilterChange}
      />,
    )
    await sourceExecute({
      add: [{ kind: 'tag', label: 'dark', value: 'dark' }],
      remove: [],
    })

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        chips: [expect.objectContaining({ id: 'tag:dark' })],
      }),
      { pageKey: '/owner-source', generation: 1 },
    )
  })
})

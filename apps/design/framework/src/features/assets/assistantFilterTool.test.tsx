import { describe, expect, it, vi } from 'vitest'
import { applyFilterExecute, applyFilterSafely } from './assistantFilterTool'
import { emptyFilter, type Filter } from '@/lib/ai/filterState'
import type { AssetMeta } from '@/lib/ai/assetIndex'

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
})

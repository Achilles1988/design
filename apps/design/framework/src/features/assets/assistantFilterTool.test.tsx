import { describe, expect, it, vi } from 'vitest'
import { applyFilterExecute } from './assistantFilterTool'
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

  it('returns full count when delta is empty', () => {
    const filterRef = { current: emptyFilter() }
    const res = applyFilterExecute(
      { add: [], remove: [] },
      { index, filterRef, onFilterChange: () => {} },
    )
    expect(res.matchCount).toBe(2)
  })
})

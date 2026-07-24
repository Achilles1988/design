// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import type { Filter, FilterChip } from '@/lib/ai/filterState'

const session = vi.hoisted(() => ({
  pageKey: '/assets/rule',
  pageState: {
    filter: undefined as Filter | undefined,
  },
  ready: false,
  setPageFilter: vi.fn(),
}))

vi.mock('@/shell/assistant/pageSession', () => ({
  useAssistantPageSession: () => session,
}))

import { usePersistentAssetFilter } from './usePersistentAssetFilter'

const darkChip: FilterChip = {
  id: 'tag:dark',
  kind: 'tag',
  label: 'dark',
  value: 'dark',
  addedBy: 'ai',
}

const manualChip: FilterChip = {
  id: 'origin:manual',
  kind: 'origin',
  label: 'manual',
  value: 'manual',
  addedBy: 'user',
}

const index: AssetMeta[] = [{
  id: 'a',
  title: 'Dark',
  summary: '',
  tags: ['dark'],
  origin: 'manual',
  hasPreview: false,
}]

describe('usePersistentAssetFilter', () => {
  beforeEach(() => {
    session.pageKey = '/assets/rule'
    session.pageState = { filter: undefined }
    session.ready = false
    session.setPageFilter.mockReset()
  })

  it('hydrates the page filter only after session and index are ready', () => {
    session.pageState = { filter: { chips: [darkChip] } }
    const { result, rerender } = renderHook(
      ({ assetIndex }) => usePersistentAssetFilter(assetIndex),
      { initialProps: { assetIndex: null as AssetMeta[] | null } },
    )

    expect(result.current.filter).toEqual({ chips: [] })
    expect(session.setPageFilter).not.toHaveBeenCalled()

    session.ready = true
    rerender({ assetIndex: null })
    expect(result.current.filter).toEqual({ chips: [] })
    expect(session.setPageFilter).not.toHaveBeenCalled()

    rerender({ assetIndex: index })
    expect(result.current.filter.chips).toEqual([darkChip])
    expect(session.setPageFilter).toHaveBeenCalledWith(
      result.current.filter,
    )
  })

  it('persists direct AI updates and functional manual updates', () => {
    session.ready = true
    const { result } = renderHook(() => usePersistentAssetFilter(index))
    session.setPageFilter.mockClear()

    act(() => result.current.setFilter({ chips: [darkChip] }))
    expect(session.setPageFilter).toHaveBeenLastCalledWith({
      chips: [darkChip],
    })

    act(() => result.current.setFilter((previous) => ({
      chips: [...previous.chips, manualChip],
    })))
    expect(result.current.filter.chips).toEqual([darkChip, manualChip])
    expect(session.setPageFilter).toHaveBeenLastCalledWith({
      chips: [darkChip, manualChip],
    })
  })

  it('waits for the destination page hydration before restoring its filter', () => {
    session.ready = true
    session.pageState = { filter: { chips: [darkChip] } }
    const writes: Array<{ pageKey: string; filter: Filter }> = []
    session.setPageFilter.mockImplementation((filter: Filter) => {
      writes.push({ pageKey: session.pageKey, filter })
    })
    const { result, rerender } = renderHook(
      () => usePersistentAssetFilter(index),
    )
    writes.length = 0

    session.pageKey = '/assets/layout'
    session.ready = false
    session.pageState = { filter: undefined }
    rerender()

    expect(result.current.filter.chips).toEqual([darkChip])
    expect(writes).toEqual([])

    session.ready = true
    session.pageState = { filter: { chips: [manualChip] } }
    rerender()

    expect(result.current.filter.chips).toEqual([manualChip])
    expect(writes).toEqual([{
      pageKey: '/assets/layout',
      filter: { chips: [manualChip] },
    }])
  })

  it('resets state and filterRef together without persisting the reset', () => {
    session.ready = true
    const { result } = renderHook(() => usePersistentAssetFilter(index))

    act(() => result.current.setFilter({ chips: [darkChip] }))
    session.setPageFilter.mockClear()
    act(() => result.current.resetFilter())

    expect(result.current.filter).toEqual({ chips: [] })
    expect(result.current.filterRef.current).toEqual({ chips: [] })
    expect(session.setPageFilter).not.toHaveBeenCalled()
  })

  it('does not recreate page state after New chat deletes it', () => {
    session.ready = true
    session.pageState = { filter: { chips: [darkChip] } }
    const { result, rerender } = renderHook(
      () => usePersistentAssetFilter(index),
    )
    session.setPageFilter.mockClear()

    session.ready = false
    act(() => result.current.resetFilter())
    session.pageState = { filter: undefined }
    rerender()
    session.ready = true
    rerender()

    expect(result.current.filter).toEqual({ chips: [] })
    expect(result.current.filterRef.current).toEqual({ chips: [] })
    expect(session.setPageFilter).not.toHaveBeenCalled()
  })

  it('does not recreate a pending destination through a stale reset callback', () => {
    session.ready = true
    session.pageState = { filter: { chips: [darkChip] } }
    const { result, rerender } = renderHook(
      () => usePersistentAssetFilter(index),
    )
    const sourceReset = result.current.resetFilter
    session.setPageFilter.mockClear()

    session.pageKey = '/assets/layout'
    session.ready = false
    session.pageState = { filter: undefined }
    rerender()
    act(() => sourceReset())
    session.ready = true
    rerender()

    expect(result.current.filter).toEqual({ chips: [] })
    expect(result.current.filterRef.current).toEqual({ chips: [] })
    expect(session.setPageFilter).not.toHaveBeenCalled()
  })
})

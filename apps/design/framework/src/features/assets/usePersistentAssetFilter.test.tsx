// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import {
  emptyFilter,
  type Filter,
  type FilterChip,
} from '@/lib/ai/filterState'

const session = vi.hoisted(() => ({
  pageKey: '/assets/rule',
  owner: {
    pageKey: '/assets/rule',
    generation: 1,
  },
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

type TestOwner = {
  pageKey: string
  generation: number
}

function ownsCurrentSession(owner: TestOwner): boolean {
  return (
    owner.pageKey === session.pageKey &&
    owner.generation === session.owner.generation
  )
}

describe('usePersistentAssetFilter', () => {
  beforeEach(() => {
    session.pageKey = '/assets/rule'
    session.owner = {
      pageKey: '/assets/rule',
      generation: 1,
    }
    session.pageState = { filter: undefined }
    session.ready = false
    session.setPageFilter.mockReset()
    session.setPageFilter.mockImplementation((
      owner: TestOwner,
      filter: Filter,
    ) => ({
      accepted: ownsCurrentSession(owner),
      ok: ownsCurrentSession(owner),
      state: {
        version: 1,
        messages: [],
        filter,
        updatedAt: '2026-07-24T00:00:00.000Z',
      },
      ...(ownsCurrentSession(owner)
        ? {}
        : { error: 'Filter update ignored because its page is no longer active.' }),
    }))
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
      session.owner,
      result.current.filter,
    )
  })

  it('persists direct AI updates and functional manual updates', () => {
    session.ready = true
    const { result } = renderHook(() => usePersistentAssetFilter(index))
    session.setPageFilter.mockClear()

    act(() => result.current.setFilter({ chips: [darkChip] }))
    expect(session.setPageFilter).toHaveBeenLastCalledWith(
      session.owner,
      { chips: [darkChip] },
    )

    act(() => result.current.setFilter((previous) => ({
      chips: [...previous.chips, manualChip],
    })))
    expect(result.current.filter.chips).toEqual([darkChip, manualChip])
    expect(session.setPageFilter).toHaveBeenLastCalledWith(
      session.owner,
      { chips: [darkChip, manualChip] },
    )
  })

  it('hides and rejects source-page filter edits while appId navigation hydrates', () => {
    const sourceKey = '/assets/rule?appId=a'
    const destinationKey = '/assets/rule?appId=b'
    const pageFilters = new Map<string, Filter>([
      [sourceKey, { chips: [darkChip] }],
      [destinationKey, { chips: [manualChip] }],
    ])
    session.pageKey = sourceKey
    session.owner = { pageKey: sourceKey, generation: 1 }
    session.ready = true
    session.pageState = { filter: pageFilters.get(sourceKey) }
    session.setPageFilter.mockImplementation((
      owner: TestOwner,
      filter: Filter,
    ) => {
      if (ownsCurrentSession(owner)) pageFilters.set(owner.pageKey, filter)
      return {
        accepted: ownsCurrentSession(owner),
        ok: ownsCurrentSession(owner),
        state: {
          version: 1,
          messages: [],
          filter,
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
        ...(ownsCurrentSession(owner)
          ? {}
          : { error: 'Filter update ignored because its page is no longer active.' }),
      }
    })
    const { result, rerender } = renderHook(
      () => usePersistentAssetFilter(index),
    )
    const sourceSetFilter = result.current.setFilter
    session.setPageFilter.mockClear()

    session.pageKey = destinationKey
    session.owner = { pageKey: destinationKey, generation: 2 }
    session.ready = false
    session.pageState = { filter: pageFilters.get(sourceKey) }
    rerender()

    expect(result.current.filter).toEqual(emptyFilter())
    expect(result.current.filterRef.current).toEqual(emptyFilter())

    act(() => sourceSetFilter((previous) => ({
      chips: previous.chips.filter((chip) => chip.id !== darkChip.id),
    })))
    act(() => sourceSetFilter(emptyFilter()))

    expect(session.setPageFilter).not.toHaveBeenCalled()
    expect(pageFilters.get(sourceKey)).toEqual({ chips: [darkChip] })
    expect(pageFilters.get(destinationKey)).toEqual({ chips: [manualChip] })

    session.ready = true
    session.pageState = { filter: pageFilters.get(destinationKey) }
    rerender()

    expect(result.current.filter.chips).toEqual([manualChip])
    expect(result.current.filterRef.current.chips).toEqual([manualChip])
    expect(pageFilters.get(sourceKey)).toEqual({ chips: [darkChip] })
    expect(pageFilters.get(destinationKey)).toEqual({ chips: [manualChip] })
  })

  it('invalidates a captured setter when the hook unmounts', () => {
    session.ready = true
    const { result, unmount } = renderHook(
      () => usePersistentAssetFilter(index),
    )
    const staleSetter = result.current.setFilter
    session.setPageFilter.mockClear()

    unmount()
    act(() => staleSetter({ chips: [darkChip] }))

    expect(session.setPageFilter).not.toHaveBeenCalled()
  })

  it('invalidates a captured setter after New chat advances the same page generation', () => {
    session.ready = true
    const { result, rerender } = renderHook(
      () => usePersistentAssetFilter(index),
    )
    const staleSetter = result.current.setFilter
    session.setPageFilter.mockClear()

    session.ready = false
    session.owner = {
      pageKey: '/assets/rule',
      generation: 2,
    }
    rerender()
    session.pageState = { filter: undefined }
    session.ready = true
    rerender()

    act(() => staleSetter({ chips: [darkChip] }))

    expect(session.setPageFilter).not.toHaveBeenCalled()
    expect(result.current.filter).toEqual(emptyFilter())
  })

  it('invalidates an old A setter after navigating A to B to A', () => {
    session.ready = true
    const { result, rerender } = renderHook(
      () => usePersistentAssetFilter(index),
    )
    const staleASetter = result.current.setFilter
    session.setPageFilter.mockClear()

    session.pageKey = '/assets/layout'
    session.owner = {
      pageKey: '/assets/layout',
      generation: 2,
    }
    session.ready = false
    rerender()
    session.ready = true
    rerender()

    session.pageKey = '/assets/rule'
    session.owner = {
      pageKey: '/assets/rule',
      generation: 3,
    }
    session.ready = false
    rerender()
    session.pageState = { filter: undefined }
    session.ready = true
    rerender()
    session.setPageFilter.mockClear()

    act(() => staleASetter({ chips: [darkChip] }))

    expect(session.setPageFilter).not.toHaveBeenCalled()
    expect(result.current.filter).toEqual(emptyFilter())
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
    session.owner = {
      pageKey: '/assets/rule',
      generation: 2,
    }
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
    session.owner = {
      pageKey: '/assets/layout',
      generation: 2,
    }
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

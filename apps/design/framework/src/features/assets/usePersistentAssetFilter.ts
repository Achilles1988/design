import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import {
  emptyFilter,
  sanitizeFilterForIndex,
  type Filter,
} from '@/lib/ai/filterState'
import { useAssistantPageSession } from '@/shell/assistant/pageSession'

type FilterUpdate = Filter | ((previous: Filter) => Filter)

export function usePersistentAssetFilter(index: AssetMeta[] | null) {
  const {
    pageKey,
    pageState,
    ready,
    setPageFilter,
  } = useAssistantPageSession()
  const [filter, setFilterState] = useState<Filter>(emptyFilter)
  const filterRef = useRef(filter)
  const inactiveFilterRef = useRef<Filter>(emptyFilter())
  const hydratedKeyRef = useRef<string | null>(null)
  const latestPageKeyRef = useRef(pageKey)
  const latestReadyRef = useRef(ready)
  const mountedRef = useRef(false)
  latestPageKeyRef.current = pageKey
  latestReadyRef.current = ready

  useLayoutEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      hydratedKeyRef.current = null
      filterRef.current = emptyFilter()
    }
  }, [])

  const ownsCurrentPage = ready && hydratedKeyRef.current === pageKey
  const exposedFilter = ownsCurrentPage ? filter : inactiveFilterRef.current
  filterRef.current = exposedFilter

  useEffect(() => {
    if (!ready || !index || hydratedKeyRef.current === pageKey) return
    const restored = sanitizeFilterForIndex(
      pageState.filter ?? emptyFilter(),
      index,
    )
    hydratedKeyRef.current = pageKey
    filterRef.current = restored
    setFilterState(restored)
    setPageFilter(pageKey, restored)
  }, [index, pageKey, pageState.filter, ready, setPageFilter])

  const setFilter = useCallback((
    update: FilterUpdate,
    ownerPageKey = pageKey,
  ) => {
    if (
      !mountedRef.current ||
      ownerPageKey !== latestPageKeyRef.current ||
      !latestReadyRef.current ||
      hydratedKeyRef.current !== ownerPageKey
    ) return false
    const next =
      typeof update === 'function' ? update(filterRef.current) : update
    const result = setPageFilter(ownerPageKey, next)
    if (!result.accepted) return false
    filterRef.current = next
    setFilterState(next)
    return true
  }, [pageKey, setPageFilter])

  const resetFilter = useCallback(() => {
    const next = emptyFilter()
    hydratedKeyRef.current = latestPageKeyRef.current
    filterRef.current = next
    setFilterState(next)
  }, [])

  return {
    filter: exposedFilter,
    filterRef,
    ownerPageKey: pageKey,
    setFilter,
    resetFilter,
  }
}

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
import {
  useAssistantPageSession,
  type AssistantPageOwner,
} from '@/shell/assistant/pageSession'

type FilterUpdate = Filter | ((previous: Filter) => Filter)

function isSameOwner(
  left: AssistantPageOwner | null,
  right: AssistantPageOwner,
): boolean {
  return (
    left?.pageKey === right.pageKey &&
    left.generation === right.generation
  )
}

export function usePersistentAssetFilter(index: AssetMeta[] | null) {
  const {
    owner,
    pageState,
    ready,
    setPageFilter,
  } = useAssistantPageSession()
  const [filter, setFilterState] = useState<Filter>(emptyFilter)
  const filterRef = useRef(filter)
  const inactiveFilterRef = useRef<Filter>(emptyFilter())
  const hydratedOwnerRef = useRef<AssistantPageOwner | null>(null)
  const latestOwnerRef = useRef(owner)
  const latestReadyRef = useRef(ready)
  const mountedRef = useRef(false)
  latestOwnerRef.current = owner
  latestReadyRef.current = ready

  useLayoutEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      hydratedOwnerRef.current = null
      filterRef.current = emptyFilter()
    }
  }, [])

  const ownsCurrentPage = ready && isSameOwner(hydratedOwnerRef.current, owner)
  const exposedFilter = ownsCurrentPage ? filter : inactiveFilterRef.current
  filterRef.current = exposedFilter

  useEffect(() => {
    if (!ready || !index || isSameOwner(hydratedOwnerRef.current, owner)) return
    const restored = sanitizeFilterForIndex(
      pageState.filter ?? emptyFilter(),
      index,
    )
    hydratedOwnerRef.current = owner
    filterRef.current = restored
    setFilterState(restored)
    if (pageState.filter) setPageFilter(owner, restored)
  }, [index, owner, pageState.filter, ready, setPageFilter])

  const setFilter = useCallback((
    update: FilterUpdate,
    mutationOwner = owner,
  ) => {
    if (
      !mountedRef.current ||
      !isSameOwner(mutationOwner, latestOwnerRef.current) ||
      !latestReadyRef.current ||
      !isSameOwner(hydratedOwnerRef.current, mutationOwner)
    ) return false
    const next =
      typeof update === 'function' ? update(filterRef.current) : update
    const result = setPageFilter(mutationOwner, next)
    if (!result.accepted) return false
    filterRef.current = next
    setFilterState(next)
    return true
  }, [owner, setPageFilter])

  const resetFilter = useCallback(() => {
    const next = emptyFilter()
    hydratedOwnerRef.current = latestOwnerRef.current
    filterRef.current = next
    setFilterState(next)
  }, [])

  return {
    filter: exposedFilter,
    filterRef,
    owner,
    setFilter,
    resetFilter,
  }
}

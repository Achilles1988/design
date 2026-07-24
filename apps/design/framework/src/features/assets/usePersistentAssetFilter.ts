import { useCallback, useEffect, useRef, useState } from 'react'
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
  const hydratedKeyRef = useRef<string | null>(null)
  const latestPageKeyRef = useRef(pageKey)
  latestPageKeyRef.current = pageKey

  useEffect(() => {
    if (!ready || !index || hydratedKeyRef.current === pageKey) return
    const restored = sanitizeFilterForIndex(
      pageState.filter ?? emptyFilter(),
      index,
    )
    hydratedKeyRef.current = pageKey
    filterRef.current = restored
    setFilterState(restored)
    setPageFilter(restored)
  }, [index, pageKey, pageState.filter, ready, setPageFilter])

  const setFilter = useCallback((update: FilterUpdate) => {
    const next =
      typeof update === 'function' ? update(filterRef.current) : update
    filterRef.current = next
    setFilterState(next)
    setPageFilter(next)
  }, [setPageFilter])

  const resetFilter = useCallback(() => {
    const next = emptyFilter()
    hydratedKeyRef.current = latestPageKeyRef.current
    filterRef.current = next
    setFilterState(next)
  }, [])

  return { filter, filterRef, setFilter, resetFilter }
}

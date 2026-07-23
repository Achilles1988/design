import { useCallback, useMemo, useRef, type MutableRefObject } from 'react'
import { z } from 'zod'
import { useAssistantTool } from '@assistant-ui/react'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { applyFilter, mergeFilterDelta, type Filter } from '@/lib/ai/filterState'
import { FilterDeltaAddSchema } from '@/lib/ai/schema'

export type ApplyFilterArgs = {
  add: Array<{ kind: 'tag' | 'origin' | 'freeform'; label: string; value: string }>
  remove: string[]
}

export type ApplyFilterResult = {
  applied: { add: ApplyFilterArgs['add']; remove: string[] }
  matchCount: number
}

export type ApplyFilterCtx = {
  index: AssetMeta[]
  filterRef: MutableRefObject<Filter>
  onFilterChange: (f: Filter) => void
}

export function applyFilterExecute(args: ApplyFilterArgs, ctx: ApplyFilterCtx): ApplyFilterResult {
  const next = mergeFilterDelta(ctx.filterRef.current, { add: args.add, remove: args.remove }, 'ai')
  ctx.onFilterChange(next)
  return {
    applied: { add: args.add, remove: args.remove },
    matchCount: applyFilter(ctx.index, next).length,
  }
}

const parameters = z.object({
  add: z.array(FilterDeltaAddSchema).default([]),
  remove: z.array(z.string()).default([]),
})

function FilterDeltaCard({ args, result }: { args: ApplyFilterArgs; result?: ApplyFilterResult }) {
  const chips = [
    ...(args.add ?? []).map((a) => `+${a.label}`),
    ...(args.remove ?? []).map((r) => `-${r}`),
  ]
  return (
    <div className="assistant-filter-card">
      <span>{chips.join(' · ') || '无变更'}</span>
      {result ? <span className="assistant-filter-card__count">{result.matchCount} 匹配</span> : null}
    </div>
  )
}

export function AssetFilterTool({ index, filterRef, onFilterChange }: ApplyFilterCtx) {
  // Keep mutable inputs in refs so the tool object / execute stay referentially
  // stable across re-renders (avoids re-registering the tool on every render)
  // while still reading the latest index / callback.
  const indexRef = useRef(index)
  indexRef.current = index
  const onFilterChangeRef = useRef(onFilterChange)
  onFilterChangeRef.current = onFilterChange

  const execute = useCallback(
    async (args: z.infer<typeof parameters>) =>
      applyFilterExecute(args, {
        index: indexRef.current,
        filterRef,
        onFilterChange: (f) => onFilterChangeRef.current(f),
      }),
    [filterRef],
  )

  const tool = useMemo(
    () => ({
      toolName: 'apply_filter',
      description: '根据用户描述增删设计资产筛选条件（chips）。仅在与设计资产筛选相关时调用。',
      parameters,
      execute,
      // assistant-ui's render component type is broadly generic; our card only
      // reads args/result, so a narrow cast is safe here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: FilterDeltaCard as any,
    }),
    [execute],
  )

  // The zod schema uses `.default([])`, so its input type differs from its
  // output type; `useAssistantTool` expects `StandardSchemaV1<TArgs, TArgs>`.
  // The schema is valid at runtime (verified end-to-end), so cast the stable
  // (memoized) tool object to the hook's parameter type.
  useAssistantTool(tool as unknown as Parameters<typeof useAssistantTool>[0])
  return null
}

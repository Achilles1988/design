import { type MutableRefObject } from 'react'
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

function FilterDeltaCard({
  args,
  result,
}: {
  args: ApplyFilterArgs
  result?: ApplyFilterResult
}) {
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

export function AssetFilterTool(ctx: ApplyFilterCtx) {
  useAssistantTool({
    toolName: 'apply_filter',
    description: '根据用户描述增删设计资产筛选条件（chips）。仅在与设计资产筛选相关时调用。',
    parameters,
    execute: async (args) => applyFilterExecute(args as ApplyFilterArgs, ctx),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: FilterDeltaCard as any,
  })
  return null
}

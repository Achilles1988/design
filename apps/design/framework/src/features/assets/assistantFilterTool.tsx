import { useCallback, useMemo, useRef, type MutableRefObject } from 'react'
import { z } from 'zod'
import { useAssistantTool } from '@assistant-ui/react'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import { applyFilter, mergeFilterDelta, type Filter } from '@/lib/ai/filterState'
import { FilterDeltaAddSchema } from '@/lib/ai/schema'
import { STALE_PAGE_FILTER_ERROR } from '@/shell/assistant/pageSession'

export type ApplyFilterArgs = {
  add: Array<{ kind: 'tag' | 'origin' | 'freeform'; label: string; value: string }>
  remove: string[]
}

type ApplyFilterSuccess = {
  success: true
  applied: { add: ApplyFilterArgs['add']; remove: string[] }
  matchCount: number
  changed: boolean
}

type ApplyFilterFailure = {
  success: false
  applied: { add: []; remove: [] }
  matchCount: number
  changed: false
  error: string
}

export type ApplyFilterResult = ApplyFilterSuccess | ApplyFilterFailure

export type ApplyFilterCtx = {
  index: AssetMeta[]
  filterRef: MutableRefObject<Filter>
  onFilterChange: (f: Filter) => boolean | void
}

type AssetFilterToolProps = {
  index: AssetMeta[]
  filterRef: MutableRefObject<Filter>
  ownerPageKey: string
  onFilterChange: (
    filter: Filter,
    ownerPageKey: string,
  ) => boolean | void
}

export function applyFilterExecute(
  args: ApplyFilterArgs,
  ctx: ApplyFilterCtx,
): ApplyFilterResult {
  const previous = ctx.filterRef.current
  const next = mergeFilterDelta(
    previous,
    { add: args.add, remove: args.remove },
    'ai',
  )
  const previousById = new Map(previous.chips.map((chip) => [chip.id, chip]))
  const nextById = new Map(next.chips.map((chip) => [chip.id, chip]))
  const sameChip = (
    left: Filter['chips'][number],
    right: Filter['chips'][number],
  ) =>
    left.kind === right.kind &&
    left.label === right.label &&
    left.value === right.value &&
    left.addedBy === right.addedBy
  const appliedRemove = previous.chips
    .filter((chip) => {
      const nextChip = nextById.get(chip.id)
      return !nextChip || !sameChip(chip, nextChip)
    })
    .map((chip) => chip.id)
  const appliedAdd = next.chips
    .filter((chip) => {
      const previousChip = previousById.get(chip.id)
      return !previousChip || !sameChip(previousChip, chip)
    })
    .map(({ kind, label, value }) => ({ kind, label, value }))
  const changed = appliedAdd.length > 0 || appliedRemove.length > 0

  if (changed) {
    ctx.filterRef.current = next
    try {
      const accepted = ctx.onFilterChange(next)
      if (accepted === false) throw new Error(STALE_PAGE_FILTER_ERROR)
    } catch (error) {
      ctx.filterRef.current = previous
      throw error
    }
  }

  return {
    success: true,
    applied: { add: appliedAdd, remove: appliedRemove },
    matchCount: applyFilter(ctx.index, next).length,
    changed,
  }
}

export function applyFilterSafely(
  args: ApplyFilterArgs,
  ctx: ApplyFilterCtx,
): ApplyFilterResult {
  try {
    return applyFilterExecute(args, ctx)
  } catch (error) {
    return {
      success: false,
      applied: { add: [], remove: [] },
      matchCount: applyFilter(ctx.index, ctx.filterRef.current).length,
      changed: false,
      error: error instanceof Error ? error.message : 'Failed to apply filters',
    }
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
  const delta = result?.applied ?? args
  const chips = [
    ...(delta.add ?? []).map((item) => `+${item.label}`),
    ...(delta.remove ?? []).map((id) => `-${id}`),
  ]
  const summary = result
    ? result.success
      ? result.changed
        ? chips.join(' · ')
        : 'No filter changes'
      : 'Filter update failed'
    : 'Applying filters…'

  return (
    <div className="assistant-filter-card">
      <span>{summary}</span>
      {result && !result.success ? (
        <span className="assistant-filter-card__error">{result.error}</span>
      ) : null}
      {result ? (
        <span className="assistant-filter-card__count">
          {result.matchCount} matches
        </span>
      ) : null}
    </div>
  )
}

export function AssetFilterTool({
  index,
  filterRef,
  ownerPageKey,
  onFilterChange,
}: AssetFilterToolProps) {
  // Keep mutable inputs in refs so the tool object / execute stay referentially
  // stable across re-renders (avoids re-registering the tool on every render)
  // while still reading the latest index / callback.
  const indexRef = useRef(index)
  indexRef.current = index
  const onFilterChangeRef = useRef(onFilterChange)
  onFilterChangeRef.current = onFilterChange

  const execute = useCallback(
    async (args: z.infer<typeof parameters>) =>
      applyFilterSafely(args, {
        index: indexRef.current,
        filterRef,
        onFilterChange: (f) =>
          onFilterChangeRef.current(f, ownerPageKey),
      }),
    [filterRef, ownerPageKey],
  )

  const tool = useMemo(
    () => ({
      toolName: 'apply_filter',
      description: 'Incrementally add or remove design-asset filter chips when the user asks to refine the visible results.',
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

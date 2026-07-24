import type { AssetMeta } from './assetIndex'

export type FilterKind = 'tag' | 'origin' | 'freeform'

export type FilterChip = {
  id: string
  kind: FilterKind
  label: string
  value: string
  addedBy: 'user' | 'ai'
}

export type Filter = { chips: FilterChip[] }

export type FilterDeltaAdd = {
  kind: FilterKind
  label: string
  value: string
}

export type FilterDelta = {
  add: FilterDeltaAdd[]
  remove: string[]
}

export type AssetMetaLike = {
  id: string
  title: string
  summary: string
  tags: string[]
  origin: string
}

export function chipId(kind: FilterKind, value: string): string {
  const prefix = kind === 'freeform' ? 'free' : kind
  return `${prefix}:${value}`
}

export function emptyFilter(): Filter {
  return { chips: [] }
}

export function sanitizeFilterForIndex(
  filter: Filter,
  index: readonly AssetMeta[],
): Filter {
  const tags = new Set(index.flatMap((item) => item.tags))
  const origins = new Set(index.map((item) => item.origin))
  return {
    chips: filter.chips.filter((chip) => {
      if (chip.kind === 'freeform') return true
      if (chip.kind === 'tag') return tags.has(chip.value)
      return origins.has(chip.value)
    }),
  }
}

export function matchesChip(meta: AssetMetaLike, chip: FilterChip): boolean {
  switch (chip.kind) {
    case 'tag':
      return meta.tags.includes(chip.value)
    case 'origin':
      return meta.origin === chip.value
    case 'freeform': {
      const hay = `${meta.title} ${meta.summary} ${meta.tags.join(' ')}`.toLowerCase()
      const alts = chip.value.toLowerCase().split('|').filter(Boolean)
      return alts.some((alt) => hay.includes(alt))
    }
  }
}

export function applyFilter<T extends AssetMetaLike>(items: T[], filter: Filter): T[] {
  if (filter.chips.length === 0) return items
  return items.filter((meta) => filter.chips.every((chip) => matchesChip(meta, chip)))
}

export function mergeFilterDelta(
  filter: Filter,
  delta: FilterDelta,
  addedBy: 'user' | 'ai',
): Filter {
  const byId = new Map(filter.chips.map((c) => [c.id, c]))
  for (const id of delta.remove) {
    byId.delete(id)
  }
  for (const add of delta.add) {
    const id = chipId(add.kind, add.value)
    if (byId.has(id)) continue
    byId.set(id, {
      id,
      kind: add.kind,
      label: add.label,
      value: add.value,
      addedBy,
    })
  }
  return { chips: Array.from(byId.values()) }
}

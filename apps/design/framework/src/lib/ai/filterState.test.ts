import { describe, expect, it } from 'vitest'
import {
  applyFilter,
  chipId,
  emptyFilter,
  matchesChip,
  mergeFilterDelta,
  type FilterChip,
} from './filterState'

const NEON = {
  id: 'neon',
  title: 'Design System Inspired by Neon',
  summary: 'Electric neon glow high-contrast dark interfaces',
  tags: ['spec'],
  origin: 'open-design',
}
const APPLE = {
  id: 'apple',
  title: 'Apple-design-analysis',
  summary: 'Photography-first premium white space',
  tags: ['spec'],
  origin: 'awesome-design-md',
}
const SHELL = {
  id: 'sidebar-shell',
  title: 'Sidebar Shell',
  summary: '左侧固定导航 + 顶栏 + 主内容区滚动',
  tags: ['layout'],
  origin: 'manual',
}

function chip(input: {
  kind: FilterChip['kind']
  value: string
  label?: string
  addedBy?: 'user' | 'ai'
}): FilterChip {
  return {
    id: chipId(input.kind, input.value),
    kind: input.kind,
    value: input.value,
    label: input.label ?? input.value,
    addedBy: input.addedBy ?? 'user',
  }
}

describe('chipId', () => {
  it('returns stable ids per kind + value', () => {
    expect(chipId('tag', 'enterprise')).toBe('tag:enterprise')
    expect(chipId('freeform', 'cool|dark')).toBe('free:cool|dark')
    expect(chipId('origin', 'manual')).toBe('origin:manual')
  })
})

describe('matchesChip', () => {
  it('matches tag chip on exact tag list membership', () => {
    expect(matchesChip(SHELL, chip({ kind: 'tag', value: 'layout' }))).toBe(true)
    expect(matchesChip(SHELL, chip({ kind: 'tag', value: 'spec' }))).toBe(false)
  })

  it('matches origin chip exactly', () => {
    expect(matchesChip(APPLE, chip({ kind: 'origin', value: 'awesome-design-md' }))).toBe(true)
    expect(matchesChip(APPLE, chip({ kind: 'origin', value: 'open-design' }))).toBe(false)
  })

  it('matches freeform via pipe-separated OR keywords, case-insensitive', () => {
    expect(matchesChip(NEON, chip({ kind: 'freeform', value: 'cool|dark|neon' }))).toBe(true)
    expect(matchesChip(NEON, chip({ kind: 'freeform', value: 'PHOTOGRAPHY' }))).toBe(false)
    expect(matchesChip(APPLE, chip({ kind: 'freeform', value: 'photography' }))).toBe(true)
  })
})

describe('applyFilter', () => {
  const items = [NEON, APPLE, SHELL]

  it('returns all items on empty filter', () => {
    expect(applyFilter(items, emptyFilter())).toEqual(items)
  })

  it('ANDs multiple chips across kinds', () => {
    const filter = {
      chips: [
        chip({ kind: 'tag', value: 'spec' }),
        chip({ kind: 'freeform', value: 'dark|neon' }),
      ],
    }
    expect(applyFilter(items, filter)).toEqual([NEON])
  })
})

describe('mergeFilterDelta', () => {
  it('adds new chips and marks author', () => {
    const next = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'ai',
    )
    expect(next.chips).toHaveLength(1)
    expect(next.chips[0]).toMatchObject({
      id: 'tag:spec',
      addedBy: 'ai',
      value: 'spec',
    })
  })

  it('is idempotent on duplicate add', () => {
    const base = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'user',
    )
    const again = mergeFilterDelta(
      base,
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'ai',
    )
    expect(again.chips).toHaveLength(1)
    expect(again.chips[0]!.addedBy).toBe('user') // 保留原作者
  })

  it('removes by id and silently ignores unknown ids', () => {
    const base = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'user',
    )
    const next = mergeFilterDelta(
      base,
      { add: [], remove: ['tag:spec', 'tag:unknown'] },
      'ai',
    )
    expect(next.chips).toHaveLength(0)
  })
})

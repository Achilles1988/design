import { describe, expect, it } from 'vitest'
import type { AssetMeta } from './assetIndex'
import { buildSystemPrompt } from './promptBuild'
import { emptyFilter, mergeFilterDelta } from './filterState'

const BASE = '# Asset Search Assistant\nBASE_PROMPT_MARKER'

const ITEMS: AssetMeta[] = [
  {
    id: 'neon',
    title: 'Neon',
    summary: 'glow',
    tags: ['spec'],
    origin: 'open-design',
    hasPreview: true,
  },
  {
    id: 'apple',
    title: 'Apple',
    summary: 'photography',
    tags: ['spec'],
    origin: 'awesome-design-md',
    hasPreview: false,
  },
]

describe('buildSystemPrompt', () => {
  it('embeds base prompt, kind and candidates', () => {
    const out = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    expect(out).toContain('BASE_PROMPT_MARKER')
    expect(out).toContain('## Kind\ndesignmd')
    expect(out).toContain('## Candidates')
    expect(out).toContain('neon | Neon')
    expect(out).toContain('apple | Apple')
  })

  it('serializes current chips (or "none")', () => {
    const empty = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    expect(empty).toMatch(/## Current chips\nnone/)

    const filter = mergeFilterDelta(
      emptyFilter(),
      { add: [{ kind: 'tag', label: 'spec', value: 'spec' }], remove: [] },
      'user',
    )
    const withChip = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter,
      candidates: ITEMS,
    })
    expect(withChip).toContain('tag:spec (spec)')
  })

  it('differs across kinds', () => {
    const a = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'designmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    const b = buildSystemPrompt({
      basePrompt: BASE,
      kind: 'layoutmd',
      filter: emptyFilter(),
      candidates: ITEMS,
    })
    expect(a).not.toBe(b)
    expect(b).toContain('## Kind\nlayoutmd')
  })
})

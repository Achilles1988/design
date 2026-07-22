import type { AssetKind } from '@/lib/types'
import { compactForPrompt, type AssetMeta } from './assetIndex'
import type { Filter } from './filterState'

export type BuildSystemPromptInput = {
  basePrompt: string
  kind: AssetKind
  filter: Filter
  candidates: AssetMeta[]
}

function formatChips(filter: Filter): string {
  if (filter.chips.length === 0) return 'none'
  return filter.chips.map((c) => `${c.id} (${c.label})`).join('\n')
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  return [
    input.basePrompt.trimEnd(),
    '',
    '## Kind',
    input.kind,
    '',
    '## Current chips',
    formatChips(input.filter),
    '',
    '## Candidates',
    compactForPrompt(input.candidates).trimEnd(),
    '',
  ].join('\n')
}

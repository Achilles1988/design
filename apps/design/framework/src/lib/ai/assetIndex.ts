import type { AssetKind } from '@/lib/types'

export type AssetMeta = {
  id: string
  title: string
  summary: string
  tags: string[]
  origin: string
  hasPreview: boolean
}

const BACKTICK_STRIP = /^`|`$/g

function stripBackticks(cell: string): string {
  return cell.trim().replace(BACKTICK_STRIP, '').trim()
}

function splitTags(cell: string): string[] {
  return cell
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function splitCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

export function parseIndexMarkdown(source: string): AssetMeta[] {
  const lines = source.split(/\r?\n/)
  const out: AssetMeta[] = []
  let inTable = false
  let sawSeparator = false
  for (const line of lines) {
    if (!inTable) {
      if (/^\|\s*dir\s*\|/i.test(line)) {
        inTable = true
        sawSeparator = false
      }
      continue
    }
    if (!sawSeparator) {
      if (/^\|\s*-{3,}/.test(line)) sawSeparator = true
      continue
    }
    if (line.trim().length === 0) break
    if (!line.trim().startsWith('|')) break
    const cells = splitCells(line)
    if (cells.length < 6) continue
    const [dirCell, titleCell, summaryCell, tagsCell, originCell, previewCell] = cells
    const id = stripBackticks(dirCell ?? '')
    if (!id) continue
    out.push({
      id,
      title: (titleCell ?? '').trim(),
      summary: (summaryCell ?? '').trim(),
      tags: splitTags(tagsCell ?? ''),
      origin: (originCell ?? '').trim(),
      hasPreview: (previewCell ?? '').trim().toUpperCase() === 'Y',
    })
  }
  return out
}

export async function fetchAssetIndex(kind: AssetKind): Promise<AssetMeta[]> {
  const res = await fetch(`/assets/${kind}/INDEX.md`)
  if (!res.ok) throw new Error(`Failed to fetch ${kind} INDEX.md: ${res.status}`)
  const text = await res.text()
  return parseIndexMarkdown(text)
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function compactForPrompt(items: AssetMeta[], limit = 40): string {
  const head = items.slice(0, limit).map((m) => {
    const tags = m.tags.join(',') || '-'
    const summary = truncate(m.summary || '-', 60)
    return `${m.id} | ${m.title} | ${tags} | ${m.origin} | ${summary}`
  })
  if (items.length > limit) {
    head.push(`… still ${items.length - limit} items match`)
  }
  return `${head.join('\n')}\n`
}

import type { StyleApplySlot } from '../../src/lib/styleSlots'

export type StylePolarity = 'light' | 'dark' | 'both'

/** Thrown when an apply needs the caller to pick a slot before writing style. */
export class NeedsStyleSlotError extends Error {
  readonly options: StyleApplySlot[]

  constructor(options: StyleApplySlot[]) {
    super('Choose Light, Dark, or Both for this style.')
    this.name = 'NeedsStyleSlotError'
    this.options = options
  }
}

/** Reads the `tags:` sequence inside the first `---` frontmatter block. */
function extractFrontmatterTags(source: string): string[] {
  const lines = source.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return []

  let closingIndex = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      closingIndex = i
      break
    }
  }
  if (closingIndex === -1) return []
  const frontmatter = lines.slice(1, closingIndex)

  const tagsIndex = frontmatter.findIndex(
    (line) => line.trim() === 'tags:',
  )
  if (tagsIndex === -1) return []

  const tags: string[] = []
  for (let i = tagsIndex + 1; i < frontmatter.length; i += 1) {
    const match = /^\s*-\s*(.+)$/.exec(frontmatter[i])
    if (!match) break
    tags.push(match[1].trim().toLowerCase())
  }
  return tags
}

/**
 * A stock style's polarity comes from its `tags:` frontmatter: an exact
 * `light` or `dark` tag restricts it to that theme; having both (or
 * neither) tag means it supports both themes.
 */
export function parseStylePolarityFromDesignMd(
  source: string,
): StylePolarity {
  const tags = extractFrontmatterTags(source)
  const hasLight = tags.includes('light')
  const hasDark = tags.includes('dark')
  if (hasLight && !hasDark) return 'light'
  if (hasDark && !hasLight) return 'dark'
  return 'both'
}

/** `both` polarity supports every slot; `light`/`dark` only support themselves. */
export function slotSupported(
  polarity: StylePolarity,
  slot: StyleApplySlot,
): boolean {
  if (polarity === 'both') return true
  return polarity === slot
}

export type StyleSlot = 'light' | 'dark'
export type StyleApplySlot = StyleSlot | 'both'

export type AppStyleSlots = {
  light?: string
  dark?: string
}

const OTHER_SLOT: Record<StyleSlot, StyleSlot> = {
  light: 'dark',
  dark: 'light',
}

/** Normalizes on-disk `app.json.style`; throws on the retired single-string shape. */
export function normalizeStyleSlots(raw: unknown): AppStyleSlots {
  if (typeof raw === 'string') {
    throw new Error('style must be an object with optional light/dark ids, not a string')
  }
  if (raw === null || typeof raw !== 'object') {
    return {}
  }
  const record = raw as Record<string, unknown>
  const style: AppStyleSlots = {}
  const light = typeof record.light === 'string' ? record.light.trim() : ''
  const dark = typeof record.dark === 'string' ? record.dark.trim() : ''
  if (light) style.light = light
  if (dark) style.dark = dark
  return style
}

/** Resolves a style id for rendering a preview: theme slot, else the other slot. */
export function resolveStyleForPreview(
  style: AppStyleSlots,
  theme: StyleSlot,
): string | undefined {
  return style[theme] ?? style[OTHER_SLOT[theme]]
}

/** Resolves a style id for display: theme slot only, no fallback. */
export function displayStyleForTheme(
  style: AppStyleSlots,
  theme: StyleSlot,
): string | undefined {
  return style[theme]
}

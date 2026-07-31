import type { AppStyleSlots, StyleApplySlot } from './styleSlots'

/**
 * Determines which slot(s) an apply actually wrote by diffing the App's
 * style before and after the request, rather than comparing the response's
 * `style` against `id` alone (which misreports `both` when the other slot
 * already held the same id before this apply ran).
 */
export function resolveAppliedSlot(
  before: AppStyleSlots | undefined,
  after: AppStyleSlots,
  id: string,
): StyleApplySlot | null {
  const lightChanged = after.light === id && before?.light !== id
  const darkChanged = after.dark === id && before?.dark !== id
  if (lightChanged && darkChanged) return 'both'
  if (lightChanged) return 'light'
  if (darkChanged) return 'dark'
  return null
}

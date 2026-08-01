const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const FONT_SIZE_PX_RE = /font-size:\s*\d+px/g
const RADIUS_PX_RE = /border-radius:\s*(4|6|999)px/g

/** Shell CSS files that must not contain bare hex or px font sizes. */
export const SHELL_CSS_PATHS: readonly string[] = [
  'styles/global.css',
  'ui/ConfirmTipHost.css',
  'ui/ChooseStyleSlotHost.css',
  'ui/FormRow.css',
  'ui/SectionHeader.css',
  'ui/DisclosureForm.css',
  'shell/SidebarShell.css',
  'shell/assistant/assistant.css',
  'features/apps/apps.css',
  'features/assets/assets.css',
  'features/settings/settings.css',
  'preview/canvasReveal.css',
] as const

export function scanShellCssViolations(source: string, filePath: string): string[] {
  const violations: string[] = []
  if (filePath.endsWith('tokens.css')) return violations

  for (const match of source.matchAll(HEX_RE)) {
    violations.push(`bare hex ${match[0]}`)
  }
  for (const match of source.matchAll(FONT_SIZE_PX_RE)) {
    violations.push(`bare ${match[0]}`)
  }
  for (const match of source.matchAll(RADIUS_PX_RE)) {
    violations.push(`bare ${match[0]} — use radius token`)
  }
  return violations
}

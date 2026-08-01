import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type StyleSlot = 'light' | 'dark'

const LIGHT_LABELS: Record<string, string> = {
  Accent: 'primary',
  Background: 'surface',
  Foreground: 'text',
  Surface: 'surface2',
  Border: 'border',
  Muted: 'muted',
}

const DARK_LABELS: Record<string, string> = {
  Primary: 'primary',
  Secondary: 'secondary',
  Surface: 'surface',
  Text: 'text',
  Success: 'success',
  Warning: 'warning',
  Danger: 'danger',
}

export function parseDesignMdColors(
  markdown: string,
  slot: StyleSlot,
): Record<string, string> {
  const labels = slot === 'light' ? LIGHT_LABELS : DARK_LABELS
  const out: Record<string, string> = {}
  const re = /\*\*([^:*]+):\*\*\s*`(#[0-9A-Fa-f]{3,8})`/g
  for (const [, label, hex] of markdown.matchAll(re)) {
    const key = labels[label.trim()]
    if (key) out[key] = hex.toLowerCase()
  }
  const combo = markdown.match(
    /Success:\*\*\s*`(#[0-9A-Fa-f]+)`.*Warn:\*\*\s*`(#[0-9A-Fa-f]+)`.*Danger:\*\*\s*`(#[0-9A-Fa-f]+)`/,
  )
  if (combo && slot === 'light') {
    out.success = combo[1].toLowerCase()
    out.warning = combo[2].toLowerCase()
    out.danger = combo[3].toLowerCase()
  }
  return out
}

export function parseDesignMdFontSans(markdown: string): string {
  const body = markdown.match(/\*\*Body:\*\*\s*`([^`]+)`/)
  if (body) return body[1].trim()
  const families = markdown.match(/primary=([^,\n]+)/i)
  if (families) return `'${families[1].trim()}', system-ui, sans-serif`
  throw new Error('font sans not found in DESIGN.md')
}

function requireKeys(c: Record<string, string>, keys: string[], label: string): void {
  for (const key of keys) {
    if (!c[key]) throw new Error(`Missing ${label} color: ${key}`)
  }
}

export function buildGeneratedBlocks(
  light: Record<string, string>,
  dark: Record<string, string>,
  lightFont: string,
  darkFont: string,
): { darkBlock: string; lightBlock: string } {
  requireKeys(
    light,
    ['primary', 'surface', 'text', 'border', 'muted', 'success', 'warning', 'danger', 'surface2'],
    'light',
  )
  requireKeys(
    dark,
    ['primary', 'secondary', 'surface', 'text', 'success', 'warning', 'danger'],
    'dark',
  )

  const darkBlock = `:root,
[data-theme='dark'] {
  --color-primary: ${dark.primary};
  --color-primary-content: #67a9e7;
  --color-secondary: ${dark.secondary};
  --color-success: ${dark.success};
  --color-warning: ${dark.warning};
  --color-danger: ${dark.danger};
  --color-surface: ${dark.surface};
  --color-surface-2: color-mix(in srgb, var(--color-text) 6%, var(--color-surface));
  --color-text: ${dark.text};
  --color-border: color-mix(in srgb, var(--color-text) 12%, transparent);
  --color-muted: color-mix(in srgb, var(--color-text) 55%, transparent);
  --color-on-primary: #ffffff;
  --color-overlay: color-mix(in srgb, #000000 45%, transparent);
  --shadow-elevated: 0 16px 48px color-mix(in srgb, #000000 28%, transparent);
  --shadow-modal: 0 24px 64px color-mix(in srgb, #000000 45%, transparent);
  --font-sans: ${darkFont};
}`

  const lightBlock = `[data-theme='light'] {
  --color-primary: ${light.primary};
  --color-primary-content: ${light.primary};
  --color-secondary: ${light.primary};
  --color-success: ${light.success};
  --color-warning: ${light.warning};
  --color-danger: ${light.danger};
  --color-surface: ${light.surface};
  --color-surface-2: ${light.surface2};
  --color-text: ${light.text};
  --color-border: ${light.border};
  --color-muted: ${light.muted};
  --color-on-primary: #ffffff;
  --color-overlay: color-mix(in srgb, #111111 45%, transparent);
  --shadow-elevated: 0 2px 8px color-mix(in srgb, #111111 8%, transparent);
  --shadow-modal: 0 24px 64px color-mix(in srgb, #111111 20%, transparent);
  --font-sans: ${lightFont};
}`

  return { darkBlock, lightBlock }
}

const STATIC_HEADER = `/* Shell design tokens — generated color/font blocks synced from design app.json style slots */

:root {
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 24px;
  --text-2xl: 32px;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --line-height-body: 1.5;
  --line-height-heading: 1.2;
  --font-mono: ui-monospace, 'JetBrains Mono', monospace;
  --space: 8px;
  --sidebar-w: 256px;
  --header-h: 60px;
  --radius-sm: 4px;
  --radius: 8px;
  --radius-md: 12px;
  --radius-full: 999px;
  --radius-circle: 50%;
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --reveal-stagger: 80ms;
}

`

export const GENERATED_START = '/* @generated colors:start — sync-shell-tokens */'
export const GENERATED_END = '/* @generated colors:end */'

export function generateTokensCss({
  appJsonPath,
  stylesRoot,
}: {
  appJsonPath: string
  stylesRoot: string
}): string {
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8')) as {
    style?: { light?: string; dark?: string }
  }
  const lightId = appJson.style?.light
  const darkId = appJson.style?.dark
  if (!lightId || !darkId) {
    throw new Error('app.json must define style.light and style.dark')
  }

  const lightMd = readFileSync(join(stylesRoot, lightId, 'DESIGN.md'), 'utf8')
  const darkMd = readFileSync(join(stylesRoot, darkId, 'DESIGN.md'), 'utf8')
  const light = parseDesignMdColors(lightMd, 'light')
  const dark = parseDesignMdColors(darkMd, 'dark')
  const lightFont = parseDesignMdFontSans(lightMd)
  const darkFont = parseDesignMdFontSans(darkMd)
  const { darkBlock, lightBlock } = buildGeneratedBlocks(light, dark, lightFont, darkFont)

  return `${STATIC_HEADER}${GENERATED_START}
${darkBlock}

${lightBlock}
${GENERATED_END}
`
}

function spliceGenerated(content: string, generated: string): string {
  const startIdx = content.indexOf(GENERATED_START)
  const endIdx = content.indexOf(GENERATED_END)
  if (startIdx === -1 || endIdx === -1) return generated
  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + GENERATED_END.length)
  const middle = generated.slice(
    generated.indexOf(GENERATED_START),
    generated.indexOf(GENERATED_END) + GENERATED_END.length,
  )
  return `${before}${middle}${after}`
}

export function runSyncShellTokensCli({
  check = false,
  designRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..'),
}: {
  check?: boolean
  designRoot?: string
} = {}): void {
  const appJsonPath = join(designRoot, 'apps/design/app.json')
  const tokensPath = join(designRoot, 'framework/src/styles/tokens.css')
  const stylesRoot = join(designRoot, 'framework/public/assets/designmd')
  const generated = generateTokensCss({ appJsonPath, stylesRoot })
  const current = readFileSync(tokensPath, 'utf8')
  const next = current.includes('@generated colors:start')
    ? spliceGenerated(current, generated)
    : generated

  if (check) {
    if (next !== current) {
      console.error('tokens.css is out of sync with app.json style slots. Run: npm run sync:tokens')
      process.exit(1)
    }
    console.log('tokens.css is in sync')
    return
  }

  writeFileSync(tokensPath, next)
  console.log(`Wrote ${tokensPath}`)
}

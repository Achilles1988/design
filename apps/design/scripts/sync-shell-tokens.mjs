import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const designRoot = join(__dirname, '..')
const appJsonPath = join(designRoot, 'apps/design/app.json')
const tokensPath = join(designRoot, 'framework/src/styles/tokens.css')
const stylesRoot = join(designRoot, 'framework/public/assets/designmd')

const LIGHT_LABELS = {
  Accent: 'primary',
  Background: 'surface',
  Foreground: 'text',
  Surface: 'surface2',
  Border: 'border',
  Muted: 'muted',
}

const DARK_LABELS = {
  Primary: 'primary',
  Secondary: 'secondary',
  Surface: 'surface',
  Text: 'text',
  Success: 'success',
  Warning: 'warning',
  Danger: 'danger',
}

/** @param {string} markdown */
/** @param {'light' | 'dark'} slot */
export function parseDesignMdColors(markdown, slot) {
  const labels = slot === 'light' ? LIGHT_LABELS : DARK_LABELS
  /** @type {Record<string, string>} */
  const out = {}
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

/** @param {string} markdown */
export function parseDesignMdFontSans(markdown) {
  const body = markdown.match(/\*\*Body:\*\*\s*`([^`]+)`/)
  if (body) return body[1].trim()
  const families = markdown.match(/primary=([^,\n]+)/i)
  if (families) return `'${families[1].trim()}', system-ui, sans-serif`
  throw new Error('font sans not found in DESIGN.md')
}

/** @param {Record<string, string>} c */
function requireKeys(c, keys, label) {
  for (const key of keys) {
    if (!c[key]) throw new Error(`Missing ${label} color: ${key}`)
  }
}

/** @param {Record<string, string>} light */
/** @param {Record<string, string>} dark */
/** @param {string} lightFont */
/** @param {string} darkFont */
export function buildGeneratedBlocks(light, dark, lightFont, darkFont) {
  requireKeys(light, ['primary', 'surface', 'text', 'border', 'muted', 'success', 'warning', 'danger', 'surface2'], 'light')
  requireKeys(dark, ['primary', 'secondary', 'surface', 'text', 'success', 'warning', 'danger'], 'dark')

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

export function generateTokensCss() {
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'))
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

  return `${STATIC_HEADER}/* @generated colors:start — sync-shell-tokens.mjs */
${darkBlock}

${lightBlock}
/* @generated colors:end */
`
}

function spliceGenerated(content, generated) {
  const start = '/* @generated colors:start — sync-shell-tokens.mjs */'
  const end = '/* @generated colors:end */'
  const startIdx = content.indexOf(start)
  const endIdx = content.indexOf(end)
  if (startIdx === -1 || endIdx === -1) {
    return generated
  }
  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + end.length)
  const middle = generated.slice(generated.indexOf(start), generated.indexOf(end) + end.length)
  return `${before}${middle}${after}`
}

function main() {
  const check = process.argv.includes('--check')
  const generated = generateTokensCss()
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()

# Shell Token Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align all Shell chrome CSS with `tokens.css` whose light/dark values come from `app.json` style slots (`default` / `dashboard`), replace hardcoded colors and typography across 13 Shell CSS files, and add a sync script to prevent drift.

**Architecture:** Phase 1 rewrites `tokens.css` manually from the approved spec, then migrates Shell CSS file-by-file using a Vitest compliance gate. Phase 2 adds `scripts/sync-shell-tokens.mjs` that reads `app.json` + `DESIGN.md` and regenerates color/font blocks in `tokens.css`, with parser unit tests and API docs.

**Tech Stack:** Vite 6, React 19, TypeScript, Vitest, Node ESM scripts, CSS custom properties.

## Global Constraints

- Spec: `docs/dev/superpowers/specs/2026-08-01-shell-token-alignment-design.md`
- Follow `.wn-ai/lessons/lesson.md`, `docs/dev/conventions/mandatory.md`, `docs/dev/conventions/coding-standards.md`
- User-facing copy: English only
- Public API surface (`sync:tokens` script) updates `docs/dev/api/shell-tokens.md` in the same task
- Do **not** edit stock asset packages under `framework/public/assets/designmd/`
- Asset preview iframe content is out of scope; asset browser **chrome** is in scope
- Typography migration: 10/11/12→`--text-xs`, 13/14→`--text-sm`, 15/16→`--text-md`, 18/20→`--text-lg`, 24→`--text-xl`
- Default Shell theme is `dark` (`theme.ts`); `:root` shares dark token values

## File Map

**Create**

- `apps/design/framework/src/styles/shellCssTokens.ts` — list in-scope Shell CSS paths + violation scanners
- `apps/design/framework/src/styles/shellCssTokens.test.ts` — compliance gate (must pass after migrations)
- `apps/design/scripts/sync-shell-tokens.mjs` — generate color/font sections of `tokens.css`
- `apps/design/scripts/sync-shell-tokens.test.mjs` — parser + generator tests (run via vitest or node --test)
- `docs/dev/api/shell-tokens.md` — sync script protocol

**Modify**

- `apps/design/framework/src/styles/tokens.css` — full token schema
- `apps/design/framework/src/styles/global.css` — body font-size → `var(--text-base)`, line-height → `var(--line-height-body)`
- `apps/design/framework/src/ui/ConfirmTipHost.css`
- `apps/design/framework/src/ui/ChooseStyleSlotHost.css`
- `apps/design/framework/src/ui/FormRow.css`
- `apps/design/framework/src/shell/SidebarShell.css`
- `apps/design/framework/src/features/apps/apps.css`
- `apps/design/framework/src/features/assets/assets.css`
- `apps/design/framework/src/features/settings/settings.css`
- `apps/design/framework/src/shell/assistant/assistant.css`
- `apps/design/framework/src/preview/canvasReveal.css`
- `apps/design/package.json` — add `sync:tokens` script

**No changes expected**

- `apps/design/framework/src/ui/SectionHeader.css` — already token-only
- `apps/design/framework/src/ui/DisclosureForm.css` — already token-only

---

### Task 1: Shell CSS compliance gate

**Files:**
- Create: `apps/design/framework/src/styles/shellCssTokens.ts`
- Create: `apps/design/framework/src/styles/shellCssTokens.test.ts`

**Interfaces:**
- Produces:
  - `export const SHELL_CSS_PATHS: readonly string[]` — paths relative to `framework/src/`
  - `export function scanShellCssViolations(source: string, filePath: string): string[]` — returns human-readable violation messages
  - Violations detected:
    1. Bare hex `#rgb|rgba|rrggbb` (case-insensitive) outside `styles/tokens.css`
    2. `font-size: <integer>px`
    3. `border-radius: <integer>px` where integer ∈ {4, 6, 999} (must use radius tokens)
- Consumes: Node `fs`, `path`; files resolved from `import.meta.url`

- [ ] **Step 1: Write failing compliance tests**

```ts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SHELL_CSS_PATHS, scanShellCssViolations } from './shellCssTokens'

const frameworkSrc = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('shell CSS token compliance', () => {
  it('lists all in-scope shell css files', () => {
    expect(SHELL_CSS_PATHS).toContain('ui/ConfirmTipHost.css')
    expect(SHELL_CSS_PATHS).toContain('shell/assistant/assistant.css')
    expect(SHELL_CSS_PATHS).not.toContain('styles/tokens.css')
  })

  it('flags bare hex in sample css', () => {
    const violations = scanShellCssViolations('.btn { color: #fff; }', 'ui/x.css')
    expect(violations.some((v) => /hex/i.test(v))).toBe(true)
  })

  it('flags bare font-size px', () => {
    const violations = scanShellCssViolations('.x { font-size: 14px; }', 'ui/x.css')
    expect(violations.some((v) => /font-size/i.test(v))).toBe(true)
  })

  it('has no violations in committed shell css (gate)', () => {
    const all: string[] = []
    for (const rel of SHELL_CSS_PATHS) {
      const abs = join(frameworkSrc, rel)
      const source = readFileSync(abs, 'utf8')
      all.push(...scanShellCssViolations(source, rel).map((v) => `${rel}: ${v}`))
    }
    expect(all).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/design`:

```bash
npm run test -- src/styles/shellCssTokens.test.ts
```

Expected: FAIL — `has no violations` reports `#fff`, `#000`, `font-size: Npx` across shell css files.

- [ ] **Step 3: Implement scanner**

```ts
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const FONT_SIZE_PX_RE = /font-size:\s*\d+px/g
const RADIUS_PX_RE = /border-radius:\s*(4|6|999)px/g

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
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/styles/shellCssTokens.test.ts`

Expected: unit tests pass; gate test FAIL (violations remain — expected until Tasks 2–7).

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/styles/shellCssTokens.ts \
        apps/design/framework/src/styles/shellCssTokens.test.ts
git commit -m "test(design-ui): add shell CSS token compliance gate"
```

---

### Task 2: Full `tokens.css` + `global.css`

**Files:**
- Modify: `apps/design/framework/src/styles/tokens.css`
- Modify: `apps/design/framework/src/styles/global.css`

**Interfaces:**
- Produces CSS custom properties consumed by all Shell CSS migrations in Tasks 3–7

- [ ] **Step 1: Replace `tokens.css` with full schema**

```css
/* Shell design tokens — dark/default from dashboard, light from default (design app.json) */

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
}

:root,
[data-theme='dark'] {
  --color-primary: #0c5cab;
  --color-primary-content: #67a9e7;
  --color-secondary: #0a4a8a;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-surface: #09090b;
  --color-surface-2: color-mix(in srgb, var(--color-text) 6%, var(--color-surface));
  --color-text: #fafafa;
  --color-border: color-mix(in srgb, var(--color-text) 12%, transparent);
  --color-muted: color-mix(in srgb, var(--color-text) 55%, transparent);
  --color-on-primary: #ffffff;
  --color-overlay: color-mix(in srgb, #000000 45%, transparent);
  --shadow-elevated: 0 16px 48px color-mix(in srgb, #000000 28%, transparent);
  --shadow-modal: 0 24px 64px color-mix(in srgb, #000000 45%, transparent);
  --font-sans: 'IBM Plex Sans', system-ui, sans-serif;
}

[data-theme='light'] {
  --color-primary: #2f6feb;
  --color-primary-content: #2f6feb;
  --color-secondary: #2f6feb;
  --color-success: #17a34a;
  --color-warning: #eab308;
  --color-danger: #dc2626;
  --color-surface: #fafafa;
  --color-surface-2: #ffffff;
  --color-text: #111111;
  --color-border: #e5e5e5;
  --color-muted: #6b6b6b;
  --color-on-primary: #ffffff;
  --color-overlay: color-mix(in srgb, #111111 45%, transparent);
  --shadow-elevated: 0 2px 8px color-mix(in srgb, #111111 8%, transparent);
  --shadow-modal: 0 24px 64px color-mix(in srgb, #111111 20%, transparent);
  --font-sans: 'Inter', -apple-system, system-ui, sans-serif;
}
```

- [ ] **Step 2: Update `global.css` body typography**

Replace:

```css
body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
```

With:

```css
body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--line-height-body);
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`

Expected: all existing tests pass; compliance gate still FAIL on other css files.

- [ ] **Step 4: Commit**

```bash
git add apps/design/framework/src/styles/tokens.css \
        apps/design/framework/src/styles/global.css
git commit -m "feat(design-ui): expand shell tokens from default/dashboard style slots"
```

---

### Task 3: Shared UI CSS migration

**Files:**
- Modify: `apps/design/framework/src/ui/ConfirmTipHost.css`
- Modify: `apps/design/framework/src/ui/ChooseStyleSlotHost.css`
- Modify: `apps/design/framework/src/ui/FormRow.css`

**Interfaces:**
- Consumes: `--color-overlay`, `--shadow-elevated`, `--shadow-modal`, `--color-on-primary`, `--text-sm`, `--text-xs`, `--radius-sm`

- [ ] **Step 1: Migrate `ConfirmTipHost.css`**

Key replacements:

```css
/* before */ background: color-mix(in srgb, #000 45%, transparent);
/* after  */ background: var(--color-overlay);

/* before */ box-shadow: 0 16px 48px color-mix(in srgb, #000 28%, transparent);
/* after  */ box-shadow: var(--shadow-elevated);

/* before */ color: #fff;
/* after  */ color: var(--color-on-primary);

/* before */ font-size: 14px;
/* after  */ font-size: var(--text-sm);

/* before */ padding: 8px 14px;
/* after  */ padding: calc(var(--space) * 1) calc(var(--space) * 1.75);
```

- [ ] **Step 2: Migrate `ChooseStyleSlotHost.css`**

Same overlay/shadow/on-primary/text-sm replacements as ConfirmTipHost (file is structurally identical).

- [ ] **Step 3: Migrate `FormRow.css`**

```css
.form-row__label {
  padding-top: calc(var(--space) * 1.25);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
}

.form-row__hint,
.form-row__error {
  font-size: var(--text-xs);
}
```

- [ ] **Step 4: Run compliance test for these files**

Run: `npm run test -- src/styles/shellCssTokens.test.ts`

Expected: violations reduced; gate may still FAIL on remaining files.

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/ui/ConfirmTipHost.css \
        apps/design/framework/src/ui/ChooseStyleSlotHost.css \
        apps/design/framework/src/ui/FormRow.css
git commit -m "refactor(design-ui): migrate shared dialog and form css to tokens"
```

---

### Task 4: `SidebarShell.css` migration

**Files:**
- Modify: `apps/design/framework/src/shell/SidebarShell.css`

**Interfaces:**
- Consumes: `--text-xs`, `--text-sm`, `--text-lg`, `--text-xl`, `--radius-sm`

- [ ] **Step 1: Replace typography and radius**

Apply these mappings throughout the file:

| Before | After |
|--------|-------|
| `font-size: 10px` | `var(--text-xs)` |
| `font-size: 13px` | `var(--text-sm)` |
| `font-size: 14px` | `var(--text-sm)` |
| `font-size: 18px` | `var(--text-lg)` |
| `font-size: 24px` | `var(--text-xl)` |
| `border-radius: 6px` | `var(--radius-sm)` (nearest; 4px token) or keep 6px as `calc(var(--radius-sm) + 2px)` — prefer `var(--radius-sm)` per spec |
| `padding: 9px 12px` | `calc(var(--space) * 1) calc(var(--space) * 1.5)` |
| `gap: 2px` | `calc(var(--space) * 0.25)` |

- [ ] **Step 2: Run compliance test**

Run: `npm run test -- src/styles/shellCssTokens.test.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/design/framework/src/shell/SidebarShell.css
git commit -m "refactor(design-ui): migrate sidebar shell css to tokens"
```

---

### Task 5: Feature pages CSS migration

**Files:**
- Modify: `apps/design/framework/src/features/apps/apps.css`
- Modify: `apps/design/framework/src/features/assets/assets.css`
- Modify: `apps/design/framework/src/features/settings/settings.css`

**Interfaces:**
- Consumes: all semantic color, text, radius tokens

- [ ] **Step 1: Migrate `apps.css`**

Replacements:

```css
/* primary buttons */
color: var(--color-on-primary);

/* typography */
font-size: 11px → var(--text-xs)
font-size: 12px → var(--text-xs)
font-size: 13px → var(--text-sm)
font-size: 14px → var(--text-sm)
font-size: 15px → var(--text-md)
font-size: 16px → var(--text-md)
font-size: 18px → var(--text-lg)
font-size: 20px → var(--text-lg)

/* radius */
border-radius: 4px → var(--radius-sm)
border-radius: 50% → var(--radius-circle)
```

- [ ] **Step 2: Migrate `assets.css` (chrome only — do not touch iframe-related selectors differently)**

```css
/* lightbox scrim */
background: var(--color-overlay);

/* modal shadow */
box-shadow: var(--shadow-modal);

/* primary button */
color: var(--color-on-primary);

/* pills */
border-radius: var(--radius-full);
border-radius: var(--radius-circle);

/* typography — same mapping table as apps.css */
```

- [ ] **Step 3: Migrate `settings.css`**

Same typography mapping; replace any bare `font-size: Npx` and `padding: 0 12px` → `0 calc(var(--space) * 1.5)`.

- [ ] **Step 4: Run compliance test**

Run: `npm run test -- src/styles/shellCssTokens.test.ts`

Expected: only `assistant.css` (and possibly `canvasReveal.css`) violations remain.

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/features/apps/apps.css \
        apps/design/framework/src/features/assets/assets.css \
        apps/design/framework/src/features/settings/settings.css
git commit -m "refactor(design-ui): migrate apps assets settings css to tokens"
```

---

### Task 6: `assistant.css` migration

**Files:**
- Modify: `apps/design/framework/src/shell/assistant/assistant.css`

**Interfaces:**
- Consumes: `--font-mono`, all text/color/radius tokens

- [ ] **Step 1: Replace monospace stacks**

```css
/* before */
font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
/* after */
font-family: var(--font-mono);
```

(Two occurrences ~lines 289 and 601.)

- [ ] **Step 2: Replace `#fff` on primary actions**

```css
color: var(--color-on-primary);
```

- [ ] **Step 3: Replace all `font-size: Npx` using mapping table**

| px | token |
|----|-------|
| 11 | `--text-xs` |
| 12 | `--text-xs` |
| 13 | `--text-sm` |
| 14 | `--text-sm` |
| 16 | `--text-md` |
| 18 | `--text-lg` |

- [ ] **Step 4: Replace radius**

```css
border-radius: 50% → var(--radius-circle)
```

- [ ] **Step 5: Normalize ad-hoc spacing where trivial**

Examples:

```css
gap: 8px → calc(var(--space) * 1)
padding: 8px 16px → calc(var(--space) * 1) calc(var(--space) * 2)
padding: 4px 10px → calc(var(--space) * 0.5) calc(var(--space) * 1.25)
```

- [ ] **Step 6: Run compliance test**

Run: `npm run test -- src/styles/shellCssTokens.test.ts`

Expected: only `canvasReveal.css` violations may remain (if any).

- [ ] **Step 7: Commit**

```bash
git add apps/design/framework/src/shell/assistant/assistant.css
git commit -m "refactor(design-ui): migrate assistant shell css to tokens"
```

---

### Task 7: `canvasReveal.css` + compliance gate green

**Files:**
- Modify: `apps/design/framework/src/preview/canvasReveal.css`

**Interfaces:**
- Consumes: `--transition-base`, `--transition-fast`, `--space`

- [ ] **Step 1: Tokenize animation timing (optional but consistent)**

```css
@media (prefers-reduced-motion: no-preference) {
  [data-canvas-reveal] > * {
    animation: canvas-reveal-in var(--transition-base) ease-out both;
    animation-delay: calc(var(--reveal-index, 0) * var(--transition-fast));
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-canvas-reveal] > * {
    animation: canvas-reveal-in-reduced var(--transition-fast) ease-out both;
  }
}

@keyframes canvas-reveal-in {
  from {
    opacity: 0;
    transform: translateY(calc(var(--space) * 0.75));
  }
  ...
}
```

Note: if `animation-delay: calc(... * var(--transition-fast))` is invalid (time × time), use `calc(var(--reveal-index, 0) * 80ms)` and add `--reveal-stagger: 80ms` to `:root` in `tokens.css` instead:

```css
:root { --reveal-stagger: 80ms; }
animation-delay: calc(var(--reveal-index, 0) * var(--reveal-stagger));
```

- [ ] **Step 2: Run full compliance gate — must pass**

Run: `npm run test -- src/styles/shellCssTokens.test.ts`

Expected: PASS — `has no violations in committed shell css (gate)` empty array.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/design/framework/src/preview/canvasReveal.css \
        apps/design/framework/src/styles/tokens.css
git commit -m "refactor(design-ui): tokenize canvas reveal motion; shell css gate green"
```

---

### Task 8: Sync script + API docs

**Files:**
- Create: `apps/design/scripts/sync-shell-tokens.mjs`
- Create: `apps/design/scripts/sync-shell-tokens.test.mjs`
- Create: `docs/dev/api/shell-tokens.md`
- Modify: `apps/design/package.json`
- Modify: `apps/design/framework/src/styles/tokens.css` — add generated banner comment blocks around color/font sections

**Interfaces:**
- Produces:
  - `parseDesignMdColors(markdown: string, slot: 'light' | 'dark'): Record<string, string>`
  - `parseDesignMdFontSans(markdown: string): string`
  - CLI: `node scripts/sync-shell-tokens.mjs [--check]` — write or verify tokens.css color/font blocks
- Consumes: `apps/design/apps/design/app.json`, resolved `DESIGN.md` paths

- [ ] **Step 1: Write failing parser tests**

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseDesignMdColors,
  parseDesignMdFontSans,
  buildTokenColorBlock,
} from './sync-shell-tokens.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultMd = readFileSync(
  join(root, 'framework/public/assets/designmd/default/DESIGN.md'),
  'utf8',
)
const dashboardMd = readFileSync(
  join(root, 'framework/public/assets/designmd/dashboard/DESIGN.md'),
  'utf8',
)

describe('parseDesignMdColors', () => {
  it('parses default (light) palette', () => {
    const c = parseDesignMdColors(defaultMd, 'light')
    expect(c.primary).toBe('#2f6feb')
    expect(c.surface).toBe('#fafafa')
    expect(c.text).toBe('#111111')
    expect(c.border).toBe('#e5e5e5')
    expect(c.muted).toBe('#6b6b6b')
  })

  it('parses dashboard (dark) palette', () => {
    const c = parseDesignMdColors(dashboardMd, 'dark')
    expect(c.primary).toBe('#0c5cab')
    expect(c.secondary).toBe('#0a4a8a')
    expect(c.surface).toBe('#09090b')
    expect(c.text).toBe('#fafafa')
  })
})

describe('parseDesignMdFontSans', () => {
  it('extracts Inter from default', () => {
    expect(parseDesignMdFontSans(defaultMd)).toContain('Inter')
  })

  it('extracts IBM Plex Sans from dashboard', () => {
    expect(parseDesignMdFontSans(dashboardMd)).toContain('IBM Plex Sans')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm run test -- scripts/sync-shell-tokens.test.mjs`

- [ ] **Step 3: Implement `sync-shell-tokens.mjs`**

Core parsing (slot-aware label mapping):

```js
const LIGHT_LABELS = {
  Accent: 'primary',
  Background: 'surface',
  Foreground: 'text',
  Surface: 'surface2',
  Border: 'border',
  Muted: 'muted',
  Success: 'success',
  Warn: 'warning',
  Danger: 'danger',
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

export function parseDesignMdColors(markdown, slot) {
  const labels = slot === 'light' ? LIGHT_LABELS : DARK_LABELS
  const out = {}
  const re = /\*\*([^:*]+):\*\*\s*`(#[0-9A-Fa-f]{3,8})`/g
  for (const [, label, hex] of markdown.matchAll(re)) {
    const key = labels[label.trim()]
    if (key) out[key] = hex.toLowerCase()
  }
  // default combined Success/Warn/Danger line
  const combo = markdown.match(/Success:\*\*\s*`(#[0-9A-Fa-f]+)`.*Warn:\*\*\s*`(#[0-9A-Fa-f]+)`.*Danger:\*\*\s*`(#[0-9A-Fa-f]+)`/)
  if (combo && slot === 'light') {
    out.success = combo[1].toLowerCase()
    out.warning = combo[2].toLowerCase()
    out.danger = combo[3].toLowerCase()
  }
  return out
}

export function parseDesignMdFontSans(markdown) {
  const body = markdown.match(/\*\*Body:\*\*\s*`([^`]+)`/)
  if (body) return body[1].trim()
  const families = markdown.match(/primary=([^,\n]+)/i)
  if (families) return `'${families[1].trim()}', system-ui, sans-serif`
  throw new Error('font sans not found in DESIGN.md')
}
```

Script reads `apps/design/apps/design/app.json`, resolves both DESIGN.md files, validates required keys exist, splices generated color/font blocks into `tokens.css` between marker comments:

```css
/* @generated colors:start — sync-shell-tokens.mjs */
...
/* @generated colors:end */
```

`--check` mode: regenerate to temp string, compare with committed file, exit 1 on diff.

- [ ] **Step 4: Add npm script**

In `apps/design/package.json`:

```json
"sync:tokens": "node scripts/sync-shell-tokens.mjs",
"sync:tokens:check": "node scripts/sync-shell-tokens.mjs --check"
```

- [ ] **Step 5: Run sync + tests**

```bash
npm run sync:tokens
npm run sync:tokens:check
npm run test
```

Expected: empty diff after sync; all tests PASS.

- [ ] **Step 6: Write `docs/dev/api/shell-tokens.md`**

Document:

- Source: `apps/design/apps/design/app.json` style slots
- Output: `framework/src/styles/tokens.css` generated blocks
- Commands: `sync:tokens`, `sync:tokens:check`
- Manual tokens (typography scale, radius, motion) are hand-maintained outside generated blocks
- Changing design App style ids requires re-run sync

- [ ] **Step 7: Commit**

```bash
git add apps/design/scripts/sync-shell-tokens.mjs \
        apps/design/scripts/sync-shell-tokens.test.mjs \
        apps/design/package.json \
        apps/design/framework/src/styles/tokens.css \
        docs/dev/api/shell-tokens.md
git commit -m "feat(design-ui): add shell token sync script from app.json style slots"
```

---

## Spec Self-Review

| Spec requirement | Task |
|------------------|------|
| tokens.css from app.json slots | Task 2, Task 8 |
| Full token schema (color/type/spacing/radius/elevation/motion) | Task 2 |
| Shell CSS hex/font-size migration | Tasks 3–7 |
| Compliance: no bare hex/font-size in shell css | Task 1 gate, Task 7 green |
| sync-shell-tokens.mjs + npm script | Task 8 |
| docs/dev/api/shell-tokens.md | Task 8 |
| Out of scope asset packages | Global Constraints |
| npm run test passes | Every task verification step |

No placeholders remain. Type/symbol names consistent across tasks.

## Manual Verification Checklist

After all tasks:

1. `npm run dev` — toggle light/dark in Sidebar; confirm light uses Inter + cobalt `#2F6FEB`, dark uses IBM Plex + `#0C5CAB`
2. Visit `/`, `/assets/rule`, `/settings` — no visual regressions on buttons, dialogs, cards
3. Open assistant panel — markdown code blocks use `--font-mono`
4. Open asset lightbox — scrim uses overlay token (not flat black in light mode)
5. `npm run sync:tokens:check` exits 0

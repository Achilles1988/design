# Dual Theme Styles (light / dark) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace App single `style` string with `{ light?, dark? }` slots, adjudicate designmd install from DESIGN.md tags on the server, and update UI plus consumers (preview resolution, assistant/prd) per the approved spec.

**Architecture:** design-fs owns polarity (`light` | `dark` | `both`) from stock frontmatter tags and apply/`slot` writes. Browser handles English `needsSlot` chooser and unsupported alerts. Canvas assistant loads every configured style contract for generation; display follows Shell theme without falling back. No runtime compatibility with `style: string`.

**Tech Stack:** Vite 6 design-fs middleware, React 19, TypeScript, Vitest, existing `confirmTip` pattern for dialogs.

## Global Constraints

- Spec: `docs/dev/superpowers/specs/2026-07-31-dual-theme-styles-design.md`
- Follow `.wn-ai/lessons/lesson.md`, `docs/dev/conventions/mandatory.md`, `docs/dev/conventions/coding-standards.md`
- User-facing copy: English only
- Public API changes update `docs/dev/api/` in the same task
- Do **not** coerce legacy `style` strings; rewrite in-repo `app.json` files
- Do not commit unless the user explicitly asks in the implementing session
- Shell style for this App after rewrite: light `default`, dark `dashboard`; prefer `sidebar-shell`

## File Map

**Create**

- `apps/design/framework/src/lib/styleSlots.ts` — `AppStyleSlots`, slot type, `normalizeStyleSlots`, `resolveStyleForPreview`, `displayStyleForTheme`
- `apps/design/framework/src/lib/styleSlots.test.ts`
- `apps/design/framework/vite-plugins/design-fs/stylePolarity.ts` — read DESIGN.md tags → polarity + `slotSupported`
- `apps/design/framework/vite-plugins/design-fs/stylePolarity.test.ts`
- `apps/design/framework/src/lib/chooseStyleSlot.ts` — promise dialog like `confirmTip` for Light/Dark/Both
- `apps/design/framework/src/lib/chooseStyleSlot.test.ts`
- `apps/design/framework/src/ui/ChooseStyleSlotHost.tsx` (+ css if needed)

**Modify**

- `apps/design/framework/src/lib/types.ts` — `AppConfig.style: AppStyleSlots`; remove or stop using `DEFAULT_STYLE` for create
- `apps/design/framework/vite-plugins/design-fs/store.ts` / `store.test.ts`
- `apps/design/framework/vite-plugins/design-fs/plugin.ts` / `plugin.test.ts`
- `apps/design/framework/vite-plugins/design-fs/assets.ts` (optional helper to resolve DESIGN.md path)
- `apps/design/framework/src/lib/api.ts` — `applyAsset` slot + `DesignFsError` / `needsSlot`; `removeAppStyle`
- `apps/design/framework/src/lib/assetNotices.ts`
- `apps/design/framework/src/features/apps/AppDetailPage.tsx` / `.test.tsx` / `apps.css`
- `apps/design/framework/src/features/assets/AssetBrowserPage.tsx` (+ tests if present)
- `apps/design/framework/src/App.tsx` — mount `ChooseStyleSlotHost`
- `apps/design/apps/design/app.json` — dual styles
- `docs/dev/api/design-fs.md`, `docs/dev/api/design-project.md`
- Canvas assistant: `context.ts`, `prompt.ts`, `transaction.ts`, `proposals.ts`, related tests
- `.wn-ai/skills/wn-design-prd/SKILL.md`, `agents/design-review.md`, `.wn-ai/lessons/lesson.md` if it cites single style
- Sweep fixtures: any `style: 'dashboard'` in tests → `style: { dark: 'dashboard' }` or dual as needed

---

### Task 1: Types + styleSlots helpers + store normalize/set/clear

**Files:**
- Create: `apps/design/framework/src/lib/styleSlots.ts`
- Create: `apps/design/framework/src/lib/styleSlots.test.ts`
- Modify: `apps/design/framework/src/lib/types.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/store.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/store.test.ts`
- Modify: `apps/design/apps/design/app.json`
- Modify: `docs/dev/api/design-fs.md` (app.json schema rows)
- Modify: `docs/dev/api/design-project.md` (resolve formulas)

**Interfaces:**
- Produces:
  - `export type StyleSlot = 'light' | 'dark'`
  - `export type StyleApplySlot = StyleSlot | 'both'`
  - `export type AppStyleSlots = { light?: string; dark?: string }`
  - `normalizeStyleSlots(raw: unknown): AppStyleSlots` — object only; omit empty; **throw** if `typeof raw === 'string'`
  - `resolveStyleForPreview(style: AppStyleSlots, theme: StyleSlot): string | undefined` — theme slot, else other slot
  - `displayStyleForTheme(style: AppStyleSlots, theme: StyleSlot): string | undefined` — theme slot only (no fallback)
  - `setAppStyle(id, patch: { light?: string | null; dark?: string | null }): Promise<AppConfig>`
  - `removeAppStyle(id, slot: StyleSlot): Promise<AppConfig>`
- Consumes: existing store read/write helpers

- [ ] **Step 1: Write failing `styleSlots` tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  displayStyleForTheme,
  normalizeStyleSlots,
  resolveStyleForPreview,
} from './styleSlots'

describe('normalizeStyleSlots', () => {
  it('keeps non-empty light/dark ids', () => {
    expect(normalizeStyleSlots({ light: 'default', dark: 'dashboard' })).toEqual({
      light: 'default',
      dark: 'dashboard',
    })
  })

  it('returns {} for missing or empty object', () => {
    expect(normalizeStyleSlots(undefined)).toEqual({})
    expect(normalizeStyleSlots({})).toEqual({})
    expect(normalizeStyleSlots({ light: '  ', dark: '' })).toEqual({})
  })

  it('rejects legacy string style', () => {
    expect(() => normalizeStyleSlots('dashboard')).toThrow(/object/i)
  })
})

describe('resolveStyleForPreview', () => {
  it('prefers theme slot then falls back', () => {
    expect(
      resolveStyleForPreview({ light: 'a', dark: 'b' }, 'light'),
    ).toBe('a')
    expect(resolveStyleForPreview({ dark: 'b' }, 'light')).toBe('b')
    expect(resolveStyleForPreview({}, 'dark')).toBeUndefined()
  })
})

describe('displayStyleForTheme', () => {
  it('does not fall back', () => {
    expect(displayStyleForTheme({ dark: 'b' }, 'light')).toBeUndefined()
    expect(displayStyleForTheme({ dark: 'b' }, 'dark')).toBe('b')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/design && npm run test -- framework/src/lib/styleSlots.test.ts`

- [ ] **Step 3: Implement `styleSlots.ts` and update `types.ts`**

```ts
// types.ts (excerpt)
import type { AppStyleSlots } from './styleSlots'
export type { AppStyleSlots, StyleSlot, StyleApplySlot } from './styleSlots'

export type AppConfig = {
  id: string
  name: string
  path?: string
  style: AppStyleSlots
  layouts: string[]
}

// Remove DEFAULT_STYLE export usages for create; keep DEFAULT_LAYOUT.
```

Implement the three helpers exactly as the tests require.

- [ ] **Step 4: Update `normalizeAppConfig` + store methods + tests**

In `store.ts`:

```ts
export function normalizeAppConfig(raw: Record<string, unknown>): AppConfig {
  // ...
  const style = normalizeStyleSlots(raw.style)
  // layouts unchanged (including legacy layout string migration)
  const app: AppConfig = { id, name, style, layouts }
  // ...
}

// createApp:
style: {},

async function setAppStyle(
  id: string,
  patch: { light?: string | null; dark?: string | null },
): Promise<AppConfig> {
  if (!('light' in patch) && !('dark' in patch)) {
    throw new Error('style patch requires light and/or dark')
  }
  const app = await readAppFile(id)
  const next = { ...app.style }
  if ('light' in patch) {
    if (patch.light === null) delete next.light
    else {
      const t = patch.light.trim()
      if (!t) throw new Error('light style id is required')
      next.light = t
    }
  }
  if ('dark' in patch) {
    if (patch.dark === null) delete next.dark
    else {
      const t = patch.dark.trim()
      if (!t) throw new Error('dark style id is required')
      next.dark = t
    }
  }
  app.style = next
  await writeAppFile(app)
  return app
}

async function removeAppStyle(id: string, slot: 'light' | 'dark'): Promise<AppConfig> {
  return setAppStyle(id, { [slot]: null })
}
```

Rewrite `store.test.ts` expectations: createApp → `style: {}`; setAppStyle patch; removeAppStyle; normalize rejects string (or test throws); fixtures with object style.

- [ ] **Step 5: Rewrite design App + API docs**

`apps/design/apps/design/app.json`:

```json
{
  "id": "design",
  "name": "design",
  "style": {
    "light": "default",
    "dark": "dashboard"
  },
  "layouts": ["sidebar-shell"],
  "path": "apps/design"
}
```

Update `design-fs.md` app.json table: `style` is object with optional `light`/`dark` strings. Update `design-project.md` resolve formulas for both slots.

- [ ] **Step 6: Run store + styleSlots tests — expect PASS**

Run: `cd apps/design && npm run test -- framework/src/lib/styleSlots.test.ts framework/vite-plugins/design-fs/store.test.ts`

---

### Task 2: Polarity + apply with slot + DELETE style HTTP

**Files:**
- Create: `apps/design/framework/vite-plugins/design-fs/stylePolarity.ts`
- Create: `apps/design/framework/vite-plugins/design-fs/stylePolarity.test.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/plugin.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/plugin.test.ts`
- Modify: `docs/dev/api/design-fs.md` (apply body, 409 needsSlot, DELETE style)

**Interfaces:**
- Produces:
  - `export type StylePolarity = 'light' | 'dark' | 'both'`
  - `parseStylePolarityFromDesignMd(source: string): StylePolarity`
  - `slotSupported(polarity: StylePolarity, slot: StyleApplySlot): boolean` — `both` polarity supports all; `light` only `light`; `dark` only `dark`
  - Apply path may throw `NeedsStyleSlotError` with `options: StyleApplySlot[]`
- Consumes: `store.setAppStyle`, `assets.assertPackageDir`, read `DESIGN.md`/`design.md` from package dir

- [ ] **Step 1: Write failing polarity tests**

```ts
it('detects light-only, dark-only, both tags, and neither as both', () => {
  expect(parseStylePolarityFromDesignMd(`---\ntags:\n- light\n---\n`)).toBe('light')
  expect(parseStylePolarityFromDesignMd(`---\ntags:\n- dark\n---\n`)).toBe('dark')
  expect(
    parseStylePolarityFromDesignMd(`---\ntags:\n- light\n- dark\n---\n`),
  ).toBe('both')
  expect(parseStylePolarityFromDesignMd(`---\ntags:\n- spec\n---\n`)).toBe('both')
})

it('slotSupported matches polarity', () => {
  expect(slotSupported('light', 'light')).toBe(true)
  expect(slotSupported('light', 'dark')).toBe(false)
  expect(slotSupported('light', 'both')).toBe(false)
  expect(slotSupported('both', 'both')).toBe(true)
})
```

Parser rules: first YAML frontmatter block only; collect sequence items under `tags:`; match exact lowercase `light` / `dark` (ignore `dark-accent`). No new YAML dependency — line-oriented scan is enough.

- [ ] **Step 2: Implement `stylePolarity.ts` — tests PASS**

- [ ] **Step 3: Write failing plugin/store apply tests**

Cover:

1. no slot + light polarity → writes `style.light`
2. no slot + both polarity → 409 body `{ needsSlot: true, options: ['light','dark','both'], error: string }`
3. slot `dark` + dark polarity → writes dark
4. slot `light` + dark polarity → 400
5. slot `both` + both polarity → both ids set
6. `DELETE /apps/:id/style/light` clears light

Use existing plugin test harness patterns in `plugin.test.ts`.

- [ ] **Step 4: Implement apply + DELETE in `plugin.ts`**

```ts
// POST apply designmd excerpt
const body = (await parseJsonBody(req)) as {
  appId?: string
  slot?: string
}
// validate appId...
await assets.assertPackageDir(kind, id)
await store.getApp(appId)

if (kind === 'layoutmd') {
  sendJson(res, 200, await store.addAppLayout(appId, id))
  return
}

const pkgDir = /* from assertPackageDir return */
const mdPath = /* first existing DESIGN.md / design.md */
const source = await fs.readFile(mdPath, 'utf8')
const polarity = parseStylePolarityFromDesignMd(source)

const rawSlot = body.slot
if (rawSlot !== undefined && rawSlot !== 'light' && rawSlot !== 'dark' && rawSlot !== 'both') {
  sendJson(res, 400, { error: 'slot must be light, dark, or both' })
  return
}

if (rawSlot === undefined) {
  if (polarity === 'both') {
    sendJson(res, 409, {
      error: 'Choose Light, Dark, or Both for this style.',
      needsSlot: true,
      options: ['light', 'dark', 'both'],
    })
    return
  }
  const app = await store.setAppStyle(appId, { [polarity]: id })
  sendJson(res, 200, app)
  return
}

if (!slotSupported(polarity, rawSlot)) {
  sendJson(res, 400, {
    error: `This style does not support the ${rawSlot} slot.`,
  })
  return
}

const patch =
  rawSlot === 'both'
    ? { light: id, dark: id }
    : { [rawSlot]: id }
sendJson(res, 200, await store.setAppStyle(appId, patch))
```

DELETE handler mirror layouts:

`DELETE /__design_fs/apps/:id/style/:slot` → `store.removeAppStyle`.

- [ ] **Step 5: Document endpoints in `design-fs.md`**

- [ ] **Step 6: Run plugin + polarity tests — expect PASS**

Run: `cd apps/design && npm run test -- framework/vite-plugins/design-fs/`

---

### Task 3: Browser client API

**Files:**
- Modify: `apps/design/framework/src/lib/api.ts`
- Create or modify: `apps/design/framework/src/lib/api.test.ts` (if none, add focused tests with `vi.stubGlobal('fetch', ...)`)

**Interfaces:**
- Produces:
  - `export class DesignFsError extends Error { status: number; needsSlot?: boolean; options?: StyleApplySlot[]; }`
  - `applyAsset(kind, id, appId, slot?: StyleApplySlot): Promise<AppConfig>` — on 409 with `needsSlot`, throw `DesignFsError`
  - `removeAppStyle(appId, slot: StyleSlot): Promise<AppConfig>`

- [ ] **Step 1: Failing tests for needsSlot error + removeAppStyle URL**

- [ ] **Step 2: Implement**

Update `request` or add `requestApply` that on `!res.ok` builds `DesignFsError` from JSON (`needsSlot`, `options`). `applyAsset` body includes `slot` when defined.

- [ ] **Step 3: Tests PASS**

---

### Task 4: Choose-slot dialog + AssetBrowserPage install flow

**Files:**
- Create: `apps/design/framework/src/lib/chooseStyleSlot.ts` + `.test.ts`
- Create: `apps/design/framework/src/ui/ChooseStyleSlotHost.tsx` (+ css)
- Modify: `apps/design/framework/src/App.tsx`
- Modify: `apps/design/framework/src/lib/assetNotices.ts`
- Modify: `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
- Add/update asset browser tests if a harness exists; otherwise cover dialog module + manual checklist in this task notes

**Interfaces:**
- Produces: `chooseStyleSlot(options: StyleApplySlot[]): Promise<StyleApplySlot | null>`
- Consumes: `designApi.applyAsset`, `DesignFsError`, URL `slot` search param

- [ ] **Step 1: Implement chooseStyleSlot + host (mirror ConfirmTipHost)**

English labels: **Light**, **Dark**, **Both**, **Cancel**.

- [ ] **Step 2: Update notices**

```ts
export const STYLE_INSTALL_TIP =
  'Style defines the visual language for the App. Installing updates the selected light/dark slot (or both). Existing Canvases may need updates to stay in sync. Install this style?'
```

Remove or stop exporting `STYLE_REPLACE_TIP`.

- [ ] **Step 3: Wire AssetBrowserPage**

Read `slot` from `useSearchParams` (`light` | `dark` only for deep-link; ignore invalid).

`runApply` for `designmd`:

1. Optional confirm with `STYLE_INSTALL_TIP` / confirmLabel `Install`
2. Call `applyAsset(kind, id, appId, urlSlot?)`
3. On `DesignFsError` with `needsSlot`: `const chosen = await chooseStyleSlot(err.options ?? ['light','dark','both'])`; if null return; retry with `chosen`
4. On other errors: `setError(message)` (unsupported English from server)
5. Success notice: `Installed style on “Name” (id) — light/dark/both.`

Lead copy: English install wording (not “replace”). `applyLabel="Install style"`.

- [ ] **Step 4: Smoke-test dialog unit tests PASS**

---

### Task 5: App detail dual style rows

**Files:**
- Modify: `apps/design/framework/src/features/apps/AppDetailPage.tsx`
- Modify: `apps/design/framework/src/features/apps/AppDetailPage.test.tsx`
- Modify: `apps/design/framework/src/features/apps/apps.css` (reuse layout chip patterns for Clear)

**Interfaces:**
- Consumes: `designApi.removeAppStyle`, links with `slot`

- [ ] **Step 1: Failing UI tests**

Assert Light and Dark rows; Edit href includes `slot=light` / `slot=dark`; Clear calls `removeAppStyle`; empty shows `—`.

- [ ] **Step 2: Implement two meta rows**

```tsx
{(['light', 'dark'] as const).map((slot) => {
  const id = app.style[slot]
  const label = slot === 'light' ? 'Light' : 'Dark'
  return (
    <div key={slot}>
      <dt>{label}</dt>
      <dd>
        {/* code or —, Edit Link, Clear button when set */}
      </dd>
    </div>
  )
})}
```

Edit: `/assets/rule?appId=${app.id}&slot=${slot}`. Clear: `removeAppStyle` then refresh local `app` state.

- [ ] **Step 3: Update fixtures in AppDetailPage.test (`style: { dark: 'dashboard' }` etc.) — PASS**

---

### Task 6: Canvas assistant loads all configured styles

**Files:**
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/context.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/prompt.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/transaction.ts`
- Modify: `apps/design/framework/vite-plugins/canvas-assistant/proposals.ts` (constraints / style ids)
- Modify: related `*.test.ts` / integration fixtures (`style: { dark: 'studio' }` etc.)
- Modify: `apps/design/framework/src/preview/CanvasAssistantTools.tsx` display row via `displayStyleForTheme` + `getTheme()` if it shows styleId
- Update `docs/dev/api/canvas-assistant.md` if it documents single `styleId` / context shape

**Interfaces:**
- Produces on context:

```ts
styles: {
  light?: AuthoringContract
  dark?: AuthoringContract
}
```

Remove single `style: AuthoringContract` (update all call sites in this task — no compatibility shim).

- Load: for each configured slot id, `loadContract`; if a configured id fails to load → throw English error for that slot
- If both slots empty → throw `The configured Style contract could not be loaded.` (or clearer: `No style is configured for this App.`)
- Prompt: format every present slot (`## Style (light)`, `## Style (dark)`)
- Trusted/transaction: validate **all** loaded style contract id/hash pairs (extend constraints accordingly — prefer `styleContracts: { light?: {id,hash}, dark?: {id,hash} }` and update zod in `canvasAssistantProtocol.ts` in the same task)
- Tools UI display: show `displayStyleForTheme(app.style, getTheme()) ?? 'not set'`

- [ ] **Step 1: Update context tests for dual load + empty hard-stop + single-slot ok**

- [ ] **Step 2: Implement context/prompt/protocol/transaction/proposals**

- [ ] **Step 3: Fix compile errors in assistant tests — full assistant test subset PASS**

Run: `cd apps/design && npm run test -- framework/vite-plugins/canvas-assistant/context.test.ts framework/vite-plugins/canvas-assistant/prompt.test.ts framework/vite-plugins/canvas-assistant/transaction.test.ts`

---

### Task 7: Skills, lessons, fixture sweep

**Files:**
- Modify: `.wn-ai/skills/wn-design-prd/SKILL.md` (style interrogation writes `style.light` / `style.dark`; generate both when both set; display follows theme)
- Modify: `.wn-ai/skills/wn-design-prd/agents/design-review.md` as needed
- Modify: `.wn-ai/lessons/lesson.md` if it says singular style path only — clarify dual slots
- Grep and fix remaining `style: 'dashboard'` / `app.style` string assumes under `apps/design/framework` and docs

- [ ] **Step 1: Grep for leftovers**

```bash
rg -n "style: '[a-z]" apps/design/framework docs/dev/api .wn-ai/skills/wn-design-prd .wn-ai/lessons
rg -n "app\\.style[^.\\[]" apps/design/framework .wn-ai/skills/wn-design-prd
```

- [ ] **Step 2: Patch skill steps**

Replace “read `app.json.style`” with dual-slot rules from spec (mandatory: at least one slot for generation; recommend/write per slot; never invent stock files).

- [ ] **Step 3: Run broader test pass**

Run: `cd apps/design && npm run test`

Expected: PASS (fix any remaining fixture `style` strings).

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `style: { light?, dark? }`, no string compat | 1 |
| design App `default`/`dashboard`, createApp `{}` | 1 |
| Polarity from tags; neither → both | 2 |
| Apply auto / needsSlot 409 / unsupported 400 / both write | 2 |
| DELETE style slot | 2 |
| Client slot + DesignFsError | 3 |
| English install UI + chooser + deep-link slot | 4 |
| App detail dual Edit/Clear | 5 |
| Preview resolve vs display no-fallback | 1 helpers; display in 5–6 |
| Assistant generate all slots; display theme | 6 |
| API + skill docs | 1–2, 6–7 |
| English copy | Global + 4–5 |

## Self-review notes

- No TBD placeholders in task steps.
- `setAppStyle` / `StyleApplySlot` / `needsSlot` names consistent across tasks.
- Canvas protocol change is intentionally in Task 6 (single coordinated break).
- `resolveStyleForPreview` is shipped in Task 1 even if first UI consumer is later — assistant/tools and any future preview chrome import it.

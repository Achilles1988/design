# Canvas Rename, Assistant UX, and README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver full Canvas rename (name + id + component file), visible AI generating/tool progress, GFM Markdown tables, Apply progressive reveal, root README polish, and remove `apps/design/README.md`.

**Architecture:** Extend design-fs with an atomic `renameCanvas` store method and HTTP/client surface; App detail owns inline Edit UI and writes a session rename notice so Canvas preview can prompt without auto-navigation. Assistant Thread uses `ThreadPrimitive.If running` for generating feedback; Markdown enables `remark-gfm` tables inside the existing wrapper. Apply remounts pass a reveal flag into the iframe document so `canvasPreviewFrame` staggers child appearance. README work is documentation-only at the repo root.

**Tech Stack:** React 19, TypeScript 5.7, React Router 7, Vite 6, Vitest 3, Testing Library, `@assistant-ui/react` 0.14, `@assistant-ui/react-markdown` 0.14, `remark-gfm`, Vercel AI SDK 4 (`ai`), project CSS tokens.

## Global Constraints

- Follow `.wn-ai/lessons/lesson.md`, `docs/dev/conventions/mandatory.md`, and `docs/dev/conventions/coding-standards.md`.
- Preserve the configured `dashboard` style; prefer `sidebar-shell` patterns; use existing tokens, IBM Plex Sans, 8pt rhythm, and 150–250 ms motion.
- All new user-facing UI copy must be English.
- Public contracts changed in a task must update the matching `docs/dev/api/` file in that same task.
- Respect `prefers-reduced-motion` for reveal animation.
- Do not auto-navigate after rename; use a dismissible banner / notice with a link to the new canvas route.
- Do not commit unless the user explicitly asks for a commit in this session.
- Spec: `docs/dev/superpowers/specs/2026-07-25-canvas-rename-assistant-ux-readme-design.md`.

## File Map

**Create**

- `apps/design/framework/src/lib/canvasRenameNotice.ts` — sessionStorage notice for renamed canvases (old id → new id).
- `apps/design/framework/src/lib/canvasRenameNotice.test.ts` — notice read/write/clear coverage.
- `apps/design/framework/src/preview/canvasReveal.css` — iframe reveal keyframes and reduced-motion fallback.

**Modify**

- `apps/design/framework/vite-plugins/design-fs/store.ts` — add `renameCanvas`.
- `apps/design/framework/vite-plugins/design-fs/store.test.ts` — rename transaction / conflict / rollback tests.
- `apps/design/framework/vite-plugins/design-fs/plugin.ts` — `POST …/canvases/:canvasId/rename`.
- `apps/design/framework/src/lib/api.ts` — `designApi.renameCanvas`.
- `docs/dev/api/design-fs.md` — document rename endpoint + client helper.
- `apps/design/framework/src/features/apps/AppDetailPage.tsx` — hover Edit inline rename.
- `apps/design/framework/src/features/apps/AppDetailPage.test.tsx` — rename UI coverage.
- `apps/design/framework/src/features/apps/apps.css` — row hover actions / edit form styles if needed.
- `apps/design/framework/src/preview/CanvasPreview.tsx` — rename banner + pass reveal into preview document.
- `apps/design/framework/src/preview/CanvasPreview.test.tsx` — banner + reveal flag coverage.
- `apps/design/framework/src/preview/canvasPreviewDocument.ts` — optional `reveal` in configuration JSON.
- `apps/design/framework/src/preview/canvasPreviewDocument.test.ts` — reveal flag in generated document.
- `apps/design/framework/src/preview/canvasPreviewFrame.tsx` — apply reveal attributes after mount.
- `apps/design/framework/src/shell/assistant/AssistantThread.tsx` — generating indicator.
- `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx` — generating visibility.
- `apps/design/framework/src/shell/assistant/assistant.css` — generating + table styles.
- `apps/design/framework/src/shell/assistant/AssistantMarkdown.tsx` — `remarkGfm`.
- `apps/design/framework/src/shell/assistant/AssistantMarkdown.test.tsx` — table rendering.
- `apps/design/package.json` / `package-lock.json` — add `remark-gfm`.
- `docs/dev/api/assistant-ui-chat.md` — tables + generating contract.
- `apps/design/framework/src/preview/CanvasAssistantTools.tsx` — fill any missing in-progress copy gaps (only if tests show silent stalls).
- `apps/design/framework/src/features/assets/assistantFilterTool.tsx` — ensure in-progress remains visible (audit only; change if needed).
- `readme.md` — Overview, AI capabilities, Getting started, Credits.
- Delete: `apps/design/README.md`.

---

### Task 1: design-fs `renameCanvas` store

**Files:**
- Modify: `apps/design/framework/vite-plugins/design-fs/store.ts`
- Modify: `apps/design/framework/vite-plugins/design-fs/store.test.ts`
- Modify: `docs/dev/api/design-fs.md` (Canvases table + Browser client; can finalize HTTP wording in Task 2 if preferred, but document the store semantics here or in Task 2 together — prefer Task 2 for the full API section)

**Interfaces:**
- Produces: `renameCanvas(appId: string, canvasId: string, input: { id: string; name: string }): Promise<CanvasEntry>`
- Consumes: existing `nameToComponentFile`, `isValidAppId`, `requireNonEmptyName`, `readCanvasesFile`, `writeCanvasesFile`, `resolveContentPath`

- [ ] **Step 1: Write the failing store tests**

Append to `store.test.ts`:

```ts
it('renames canvas id, name, and component file', async () => {
  const store = createContentStore(root)
  await store.createApp({ id: 'orders', name: 'Orders' })
  await store.addCanvas('orders', { id: 'home', name: 'Home' })

  const renamed = await store.renameCanvas('orders', 'home', {
    id: 'landing',
    name: 'Landing',
  })

  expect(renamed).toEqual({
    id: 'landing',
    name: 'Landing',
    component: 'Landing.tsx',
  })
  await expect(
    fs.access(path.join(root, 'orders', 'canvases', 'Home.tsx')),
  ).rejects.toThrow()
  await expect(
    fs.access(path.join(root, 'orders', 'canvases', 'Landing.tsx')),
  ).resolves.toBeUndefined()
  const data = JSON.parse(
    await fs.readFile(path.join(root, 'orders', 'canvases.json'), 'utf8'),
  ) as { canvases: Array<{ id: string }> }
  expect(data.canvases.map((c) => c.id)).toEqual(['landing'])
})

it('rejects rename when the new id is taken by another canvas', async () => {
  const store = createContentStore(root)
  await store.createApp({ id: 'orders', name: 'Orders' })
  await store.addCanvas('orders', { id: 'home', name: 'Home' })
  await store.addCanvas('orders', { id: 'about', name: 'About' })
  await expect(
    store.renameCanvas('orders', 'home', { id: 'about', name: 'Home' }),
  ).rejects.toThrow(/exists/)
  await expect(
    fs.access(path.join(root, 'orders', 'canvases', 'Home.tsx')),
  ).resolves.toBeUndefined()
})

it('returns the same entry when rename is a no-op', async () => {
  const store = createContentStore(root)
  await store.createApp({ id: 'orders', name: 'Orders' })
  const canvas = await store.addCanvas('orders', { id: 'home', name: 'Home' })
  const again = await store.renameCanvas('orders', 'home', {
    id: 'home',
    name: 'Home',
  })
  expect(again).toEqual(canvas)
})

it('rolls back the file rename when canvases.json write fails', async () => {
  const store = createContentStore(root)
  await store.createApp({ id: 'orders', name: 'Orders' })
  await store.addCanvas('orders', { id: 'home', name: 'Home' })
  const canvasesJson = path.join(root, 'orders', 'canvases.json')
  const realWrite = fs.writeFile.bind(fs)
  const writeSpy = vi
    .spyOn(fs, 'writeFile')
    .mockImplementation(async (file, data, options) => {
      if (path.resolve(String(file)) === path.resolve(canvasesJson)) {
        throw new Error('disk full')
      }
      return realWrite(file, data, options as never)
    })
  await expect(
    store.renameCanvas('orders', 'home', { id: 'landing', name: 'Landing' }),
  ).rejects.toThrow(/disk full/)
  writeSpy.mockRestore()
  await expect(
    fs.access(path.join(root, 'orders', 'canvases', 'Home.tsx')),
  ).resolves.toBeUndefined()
  await expect(
    fs.access(path.join(root, 'orders', 'canvases', 'Landing.tsx')),
  ).rejects.toThrow()
})
```

If the project’s `fs` import style makes `vi.spyOn(fs, 'writeFile')` awkward, equivalent approach: temporarily `chmod` the json file read-only, then restore — pick whichever is reliable in this repo’s vitest setup. Do not leave a flaky spy.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/design && npx vitest run framework/vite-plugins/design-fs/store.test.ts`

Expected: FAIL — `renameCanvas` is not a function / not exported.

- [ ] **Step 3: Implement `renameCanvas`**

In `store.ts`, add and export via the returned store object:

```ts
async function renameCanvas(
  appId: string,
  canvasId: string,
  input: { id: string; name: string },
): Promise<CanvasEntry> {
  await getApp(appId)
  if (!isValidAppId(input.id)) {
    throw new Error(`Invalid canvas id: ${input.id}`)
  }
  const name = requireNonEmptyName(input.name, 'Canvas name')
  const dir = appDir(appId)
  const data = await readCanvasesFile(dir)
  const idx = data.canvases.findIndex((c) => c.id === canvasId)
  if (idx === -1) {
    throw new Error(`Canvas not found: ${canvasId}`)
  }
  const current = data.canvases[idx]
  const component = nameToComponentFile(name, input.id)

  if (
    current.id === input.id &&
    current.name === name &&
    current.component === component
  ) {
    return current
  }

  if (
    data.canvases.some((c, i) => i !== idx && c.id === input.id)
  ) {
    throw new Error(`Canvas already exists: ${input.id}`)
  }
  if (
    data.canvases.some((c, i) => i !== idx && c.component === component)
  ) {
    throw new Error(`Component already exists: ${component}`)
  }

  const fromPath = resolveContentPath(dir, 'canvases', current.component)
  const toPath = resolveContentPath(dir, 'canvases', component)
  let renamedFile = false
  if (current.component !== component) {
    await fs.rename(fromPath, toPath)
    renamedFile = true
  }

  const updated: CanvasEntry = { id: input.id, name, component }
  data.canvases[idx] = updated
  try {
    await writeCanvasesFile(dir, data)
  } catch (err) {
    if (renamedFile) {
      try {
        await fs.rename(toPath, fromPath)
      } catch {
        // best-effort rollback; rethrow original
      }
    }
    throw err
  }
  return updated
}
```

Do not rewrite the `.tsx` source export identifier — filename + `canvases.json` update is enough.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/design && npx vitest run framework/vite-plugins/design-fs/store.test.ts`

Expected: PASS

- [ ] **Step 5: Stop for review** (commit only if the user asked)

---

### Task 2: HTTP route, `designApi`, and design-fs docs

**Files:**
- Modify: `apps/design/framework/vite-plugins/design-fs/plugin.ts`
- Modify: `apps/design/framework/src/lib/api.ts`
- Modify: `docs/dev/api/design-fs.md`

**Interfaces:**
- Consumes: `store.renameCanvas(appId, canvasId, { id, name })`
- Produces: `POST /__design_fs/apps/:appId/canvases/:canvasId/rename` → `CanvasEntry`; `designApi.renameCanvas(appId, canvasId, body)`

- [ ] **Step 1: Add the plugin route**

Before the final `sendJson(res, 404, …)` in the canvases branch, handle:

```ts
// POST /__design_fs/apps/:id/canvases/:canvasId/rename
if (
  parts.length === 6 &&
  parts[5] === 'rename' &&
  method === 'POST'
) {
  const canvasId = parts[4]
  const body = (await parseJsonBody(req)) as {
    id?: string
    name?: string
  }
  if (typeof body.id !== 'string' || typeof body.name !== 'string') {
    sendJson(res, 400, { error: 'id and name are required' })
    return
  }
  const canvas = await store.renameCanvas(appId, canvasId, {
    id: body.id,
    name: body.name,
  })
  sendJson(res, 200, canvas)
  return
}
```

Confirm `statusForError` already maps `/already exists/i` → 409 and not-found → 404.

- [ ] **Step 2: Add the client helper**

In `api.ts` next to `deleteCanvas`:

```ts
renameCanvas: (
  appId: string,
  canvasId: string,
  body: { id: string; name: string },
) =>
  request<CanvasEntry>(
    `/__design_fs/apps/${appId}/canvases/${encodeURIComponent(canvasId)}/rename`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  ),
```

- [ ] **Step 3: Update `docs/dev/api/design-fs.md`**

Add to the Canvases table:

`| `POST` | `/apps/:id/canvases/:canvasId/rename` | `{ "id", "name" }` | `CanvasEntry` |`

Document behavior: renames display name, id, and component file; conflicts leave disk unchanged; best-effort file rollback if `canvases.json` write fails.

Add `renameCanvas(appId, canvasId, { id, name })` to the Browser client bullet list.

- [ ] **Step 4: Smoke the TypeScript build for touched modules**

Run: `cd apps/design && npx tsc -b --noEmit`

Expected: PASS (or only pre-existing unrelated errors — fix warnings in touched files).

- [ ] **Step 5: Stop for review**

---

### Task 3: Rename notice helper + App detail Edit UI

**Files:**
- Create: `apps/design/framework/src/lib/canvasRenameNotice.ts`
- Create: `apps/design/framework/src/lib/canvasRenameNotice.test.ts`
- Modify: `apps/design/framework/src/features/apps/AppDetailPage.tsx`
- Modify: `apps/design/framework/src/features/apps/AppDetailPage.test.tsx`
- Modify: `apps/design/framework/src/features/apps/apps.css` (hover action visibility)

**Interfaces:**
- Produces:
  - `type CanvasRenameNotice = { appId: string; fromId: string; toId: string; name: string }`
  - `writeCanvasRenameNotice(notice: CanvasRenameNotice): void`
  - `readCanvasRenameNotice(appId: string, canvasId: string): CanvasRenameNotice | null` — returns notice when `canvasId === fromId` for that `appId`
  - `clearCanvasRenameNotice(): void`
- Consumes: `designApi.renameCanvas`, `emitCanvasesChanged`, existing Add-canvas slugify / `isValidAppId` patterns

- [ ] **Step 1: Write failing notice tests**

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearCanvasRenameNotice,
  readCanvasRenameNotice,
  writeCanvasRenameNotice,
} from './canvasRenameNotice'

afterEach(() => {
  clearCanvasRenameNotice()
})

describe('canvasRenameNotice', () => {
  it('returns the notice only for the old canvas id', () => {
    writeCanvasRenameNotice({
      appId: 'acme',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })
    expect(readCanvasRenameNotice('acme', 'home')).toEqual({
      appId: 'acme',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })
    expect(readCanvasRenameNotice('acme', 'landing')).toBeNull()
    expect(readCanvasRenameNotice('other', 'home')).toBeNull()
  })
})
```

- [ ] **Step 2: Implement the notice module**

Use session key `wn.canvas.rename-notice.v1` and JSON `{ appId, fromId, toId, name }`. Invalid JSON → treat as empty. `clearCanvasRenameNotice` removes the key.

- [ ] **Step 3: Write failing App detail rename tests**

Extend `AppDetailPage.test.tsx` mocks with `renameCanvas: vi.fn(async () => ({ id: 'landing', name: 'Landing', component: 'Landing.tsx' }))`.

Add cases:

1. Hover/focus row → **Edit** appears; click Edit → Name/ID inputs; Save calls `renameCanvas('acme', 'home', { id: 'landing', name: 'Landing' })`, emits `emitCanvasesChanged`, exits edit mode.
2. Invalid id keeps edit mode and does not call API.
3. Cancel restores view mode without API call.

Use `fireEvent.mouseEnter` / focus within the actions cell as needed so hover styles are not the only way to reach Edit (keyboard: button should remain in DOM but may be visually opacity-0 until hover — for a11y keep Edit focusable always, visually emphasize on row hover).

- [ ] **Step 4: Implement App detail UI**

State: `editingId: string | null`, edit name/id/dirty/error/submitting mirrors Add canvas.

Per row:

- View mode: existing Name link + ID + actions (`Edit`, `Delete`). CSS: `.apps-table__actions .apps-btn--edit` visible on `tr:hover` / `tr:focus-within` (and always visible when that row is the editing row).
- Edit mode: replace cells with Name + ID inputs + Save / Cancel; disable Delete while editing.

On successful Save when `fromId !== toId` or name changed: `writeCanvasRenameNotice({ appId, fromId: canvas.id, toId: result.id, name: result.name })` then refresh list + `emitCanvasesChanged('sidebar')` (same event pattern as add/delete).

Copy: `Edit`, `Save`, `Cancel`, `Renaming…` while submitting.

- [ ] **Step 5: Run tests**

Run: `cd apps/design && npx vitest run framework/src/lib/canvasRenameNotice.test.ts framework/src/features/apps/AppDetailPage.test.tsx`

Expected: PASS

- [ ] **Step 6: Stop for review**

---

### Task 4: Old-route rename banner on Canvas preview

**Files:**
- Modify: `apps/design/framework/src/preview/CanvasPreview.tsx`
- Modify: `apps/design/framework/src/preview/CanvasPreview.test.tsx`

**Interfaces:**
- Consumes: `readCanvasRenameNotice`, `clearCanvasRenameNotice`
- Produces: dismissible banner with link to `/apps/${appId}/canvases/${toId}`

- [ ] **Step 1: Write the failing banner test**

In `CanvasPreview.test.tsx`, when `listCanvases` does not include current `canvasId` but a notice matches `fromId`, expect:

- English text including `Canvas renamed`
- A link named with the new canvas name pointing at the new route

Also: when entry exists and notice matches old id still in URL (edge: stale navigation), show the same banner above the preview.

- [ ] **Step 2: Implement banner**

On mount / param change:

```ts
const notice = readCanvasRenameNotice(appId, canvasId)
```

If notice: render a `role="status"` banner:

`Canvas renamed. Open “{notice.name}”.` + `Link` to new route + `Dismiss` button that calls `clearCanvasRenameNotice` and clears local state.

If canvas entry is missing and notice matches: show banner + existing error message (do not auto-redirect).

- [ ] **Step 3: Run tests**

Run: `cd apps/design && npx vitest run framework/src/preview/CanvasPreview.test.tsx`

Expected: PASS

- [ ] **Step 4: Stop for review**

---

### Task 5: Assistant generating indicator

**Files:**
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantThread.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/assistant.css`
- Modify: `docs/dev/api/assistant-ui-chat.md` (generating sentence; tables land in Task 6 — either update generating here and tables in Task 6, or one docs pass in Task 6 covering both; prefer mention generating here and finish Markdown section in Task 6)

**Interfaces:**
- Consumes: `ThreadPrimitive.If` with `running={true}` from `@assistant-ui/react`
- Produces: visible `Generating…` status in the thread while `isRunning`

- [ ] **Step 1: Write the failing thread test**

Extend `AssistantThread.test.tsx` so a runtime with `isRunning: true` (or adapter that never yields) renders accessible status text `Generating…`. Prefer driving via the real `ThreadPrimitive.If` under a LocalRuntime mock already used in that file.

- [ ] **Step 2: Implement UI**

Inside `ThreadPrimitive.Viewport`, after messages:

```tsx
<ThreadPrimitive.If running>
  <p className="aui-thread-generating" role="status" aria-live="polite">
    Generating…
  </p>
</ThreadPrimitive.If>
```

Ensure Composer Send remains disabled while running (ComposerPrimitive usually handles this; verify CSS `:disabled` still applies). Do not replace hydration “Loading conversation…” in `AssistantPanel`.

- [ ] **Step 3: Style**

Add `.aui-thread-generating` using muted token text and optional small pulse/opacity within 150–250 ms; respect reduced motion (static opacity).

- [ ] **Step 4: Document**

In `docs/dev/api/assistant-ui-chat.md`, note that while the thread is running the composer shows busy state and the viewport shows English `Generating…` via `ThreadPrimitive.If`.

- [ ] **Step 5: Run tests**

Run: `cd apps/design && npx vitest run framework/src/shell/assistant/AssistantThread.test.tsx`

Expected: PASS

- [ ] **Step 6: Stop for review**

---

### Task 6: GFM Markdown tables

**Files:**
- Modify: `apps/design/package.json` / `package-lock.json` — add `remark-gfm`
- Modify: `apps/design/framework/src/shell/assistant/AssistantMarkdown.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantMarkdown.test.tsx`
- Modify: `apps/design/framework/src/shell/assistant/assistant.css`
- Modify: `docs/dev/api/assistant-ui-chat.md`

**Interfaces:**
- Produces: assistant Markdown tables via `remarkPlugins={[remarkGfm]}` on `MarkdownTextPrimitive`
- Still blocks: external images (`img: BlockedImage`), no syntax highlighter, no task-list requirement beyond whatever remark-gfm enables — if GFM enables task lists as a side effect, leave default GFM behavior unless it breaks layout; do not add custom task-list UI. Spec’s “unchanged exclusions: task lists” means do not specially support/style them; if remark-gfm parses them as lists, that is acceptable without extra chrome.

- [ ] **Step 1: Install dependency**

Run: `cd apps/design && npm install remark-gfm@^4`

Expected: `remark-gfm` listed in `dependencies`.

- [ ] **Step 2: Write failing table test**

Extend `markdownText` (or add a second message case) with:

```md
| Style | Layout |
| --- | --- |
| dashboard | sidebar-shell |
```

Assert `screen.getByRole('table')` and cells containing `dashboard` / `sidebar-shell`.

- [ ] **Step 3: Implement**

```tsx
import remarkGfm from 'remark-gfm'

// inside AssistantMarkdownImpl:
<MarkdownTextPrimitive
  className="aui-md"
  remarkPlugins={[remarkGfm]}
  components={{ img: BlockedImage }}
/>
```

- [ ] **Step 4: CSS**

```css
.aui-md .aui-md-table-wrap,
.aui-md table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
.aui-md table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
}
.aui-md th,
.aui-md td {
  border: 1px solid var(--color-border, currentColor);
  padding: 0.5rem 0.75rem;
  text-align: left;
}
```

Use real project border/text tokens already used in `assistant.css` (match existing variable names; do not invent new palette).

- [ ] **Step 5: Update API doc**

Change the Markdown contract line from “不启用 GFM 表格…” to state tables are supported; task lists / syntax highlighting / external images remain unsupported or unstyled as before.

- [ ] **Step 6: Run tests**

Run: `cd apps/design && npx vitest run framework/src/shell/assistant/AssistantMarkdown.test.tsx`

Expected: PASS

- [ ] **Step 7: Stop for review**

---

### Task 7: Tool-stage visibility audit (canvas apply + asset filter)

**Files:**
- Modify only if gaps found: `apps/design/framework/src/preview/CanvasAssistantTools.tsx`, `apps/design/framework/src/features/assets/assistantFilterTool.tsx`, related tests

**Interfaces:**
- Consumes: existing apply status phases and filter card `Applying filters…`
- Produces: no silent tool wait without English in-progress copy

- [ ] **Step 1: Audit with existing tests**

Run:

```bash
cd apps/design && npx vitest run \
  framework/src/preview/CanvasAssistantTools.test.tsx \
  framework/src/features/assets/assistantFilterTool.test.tsx
```

Read tool UIs: while `result` is undefined, cards must show in-progress English (`Applying filters…`, layout/proposal waiting states, apply phases).

- [ ] **Step 2: Fix only real gaps**

If a tool card renders empty/null while pending, add a single status line (e.g. `Working…` or tool-specific English already used elsewhere). Do not redesign cards.

- [ ] **Step 3: Add/adjust a focused test for any fix**

Expected: PASS for the touched tool test file(s).

- [ ] **Step 4: Stop for review**

---

### Task 8: Apply progressive reveal

**Files:**
- Modify: `apps/design/framework/src/preview/canvasPreviewDocument.ts`
- Modify: `apps/design/framework/src/preview/canvasPreviewDocument.test.ts`
- Modify: `apps/design/framework/src/preview/CanvasPreview.tsx`
- Modify: `apps/design/framework/src/preview/CanvasPreview.test.tsx`
- Modify: `apps/design/framework/src/preview/canvasPreviewFrame.tsx`
- Create: `apps/design/framework/src/preview/canvasReveal.css`

**Interfaces:**
- Extends `CanvasPreviewConfiguration` with optional `reveal?: boolean`
- When `reveal: true`, after Canvas mounts, set `data-canvas-reveal` on `#root` and stagger direct element children; clear after animation end / timeout
- `prefers-reduced-motion: reduce` → single fade or immediate show

- [ ] **Step 1: Failing document test**

Assert `createCanvasPreviewDocument({ …, reveal: true })` embeds `"reveal":true` (or `reveal: true`) inside the configuration JSON script payload.

- [ ] **Step 2: Extend configuration type + document**

Add `reveal?: boolean` to `CanvasPreviewConfiguration`; it is already JSON-serialized via `safeJson(configuration)`.

- [ ] **Step 3: CanvasPreview passes reveal on apply remount only**

Track whether the next remount should reveal:

```ts
const revealOnNextRemount = useRef(false)
// in subscribeApplied callback:
revealOnNextRemount.current = true
setPreviewRevision((n) => n + 1)

// when building document:
reveal: revealOnNextRemount.current,
// after using it for this generation, set revealOnNextRemount.current = false
```

Initial load / non-apply remounts: `reveal: false` / omit.

Test: after matching `canvas-assistant:applied`, the iframe `srcDoc` contains reveal true; initial render does not.

- [ ] **Step 4: Implement frame-side reveal**

In `canvasPreviewFrame.tsx`, import `./canvasReveal.css`. After successful `createRoot(…).render(…)` and before/within the ready rAF:

```ts
if (configuration.reveal) {
  const root = rootElement
  root.setAttribute('data-canvas-reveal', 'true')
  const children = Array.from(root.children) as HTMLElement[]
  children.forEach((el, index) => {
    el.style.setProperty('--reveal-index', String(index))
  })
  window.setTimeout(() => {
    root.removeAttribute('data-canvas-reveal')
    children.forEach((el) => el.style.removeProperty('--reveal-index'))
  }, 900)
}
```

`canvasReveal.css`:

```css
@media (prefers-reduced-motion: no-preference) {
  [data-canvas-reveal] > * {
    animation: canvas-reveal-in 220ms ease-out both;
    animation-delay: calc(var(--reveal-index, 0) * 80ms);
  }
}

@keyframes canvas-reveal-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
```

If Canvas renders a single wrapper, stagger still applies to that one child (acceptable). Do not attempt deep DOM traversal beyond `#root` children.

- [ ] **Step 5: Run tests**

Run:

```bash
cd apps/design && npx vitest run \
  framework/src/preview/canvasPreviewDocument.test.ts \
  framework/src/preview/CanvasPreview.test.tsx
```

Expected: PASS

- [ ] **Step 6: Stop for review**

---

### Task 9: Root README + delete `apps/design/README.md`

**Files:**
- Modify: `readme.md`
- Delete: `apps/design/README.md`

**Interfaces:** none (docs only)

- [ ] **Step 1: Rewrite root `readme.md`**

Keep the product positioning. Ensure:

1. **Overview** (or opening paragraph) states the engineering app was built with AI collaboration.
2. **Core Features** explicitly include AI interaction: filter assets; create canvases (and rename once Task 3 is done — say “add, rename, and remove” under Canvas management).
3. Short **Getting started** absorbed from the deleted file:

```bash
cd apps/design
npm install
npm run dev
```

Plus a one-line note that design-fs write APIs require `npm run dev`, with pointer to `docs/dev/api/design-fs.md`.
4. End with **Acknowledgements** / **Credits** naming at least:
   - [Vercel AI SDK](https://sdk.vercel.ai) (`ai`)
   - [assistant-ui](https://www.assistant-ui.com) (`@assistant-ui/react`, `@assistant-ui/react-markdown`)

Tone: respectful attribution, not a full dependency dump.

- [ ] **Step 2: Delete `apps/design/README.md`**

Remove the file. Do not rewrite archived plans under `docs/dev/superpowers/plans/` that historically mentioned it.

- [ ] **Step 3: Grep for live pointers**

Run: `rg -n "apps/design/README" -g '!docs/dev/superpowers/plans/**' .`

Expected: no current-facing references (AGENTS/CLAUDE/memory/root docs). If any remain outside archived plans, update them to `readme.md`.

- [ ] **Step 4: Stop for review**

---

### Task 10: Full verification

**Files:** none new

- [ ] **Step 1: Unit tests**

Run: `cd apps/design && npm test`

Expected: PASS

- [ ] **Step 2: Production build**

Run: `cd apps/design && npm run build`

Expected: PASS; no new warnings in files touched by this plan.

- [ ] **Step 3: Manual smoke checklist** (dev server)

1. App detail: hover Edit → rename id+name → sidebar updates; open old canvas URL → banner + link; dismiss works.
2. Assistant: send prompt → see `Generating…` before tokens; table in reply renders; filter tool shows applying text.
3. Canvas Apply → preview remounts with staggered fade; with OS reduced-motion, no stagger.
4. Root README reads correctly; `apps/design/README.md` gone.

- [ ] **Step 4: Final stop** — report results; commit only if the user asks.

---

## Spec coverage (self-review)

| Spec section | Task(s) |
| --- | --- |
| 4 Canvas Rename API/UI/old route | 1–4 |
| 5 Generating + tool stages | 5, 7 |
| 6 Markdown tables | 6 |
| 7 Apply progressive reveal | 8 |
| 8 README + delete apps README | 9 |
| 9–10 Errors / testing / verification | embedded per task + Task 10 |
| Out of scope (sidebar rename, auto-nav, etc.) | not scheduled |

## Placeholder / consistency check

- `renameCanvas` signature is identical across store, plugin, and `designApi`.
- Notice helpers use `fromId` / `toId` consistently in Tasks 3–4.
- Reveal flag is `reveal?: boolean` on `CanvasPreviewConfiguration` in Tasks 8 only.
- No TBD/TODO left in steps.

# Apps/Canvas Sidebar Navigation & Terminology Rename (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Phase 1 apps/pages management UI so that: (1) the sidebar shows every App with a collapsible second-level tree of its Canvases and drops the static "New app" link; (2) the main content area centers and widens; (3) redundant "All apps" button and "No pages yet..." empty-state text are removed; (4) the domain concept "page" is fully renamed to "canvas" across types, API routes, on-disk files, front-end routes, docs, and the glossary.

**Architecture:** No new runtime dependencies. Rename is bottom-up through existing layers: domain types → content store (fs) → Vite middleware routes → browser API client → preview loader/component → feature UI → shell. A new tiny module-level event bus (`framework/src/lib/canvasEvents.ts`, built on `EventTarget`) lets `AppDetailPage` notify `SidebarShell` after canvas add/delete so the tree refreshes without a state-management library.

**Tech Stack:** unchanged — React 19, Vite 6, TypeScript, React Router 7, Vitest, Node `fs/promises`.

## Global Constraints

- Follow `docs/dev/conventions/coding-standards.md` and `docs/dev/conventions/mandatory.md`.
- Spec: `docs/dev/superpowers/specs/2026-07-21-apps-canvas-sidebar-nav-design.md` — this plan must satisfy every row in its "Success criteria" and "Rename map".
- No new dependencies; no aggregate API endpoint; no localStorage persistence for collapse state (all confirmed out of scope in the spec).
- Never write outside `apps/design/apps/` from the file API (unchanged safety rule from Phase 1).
- After the rename, `grep -ri "page" apps/design/framework docs/dev/api/design-fs.md` must return **no** domain-meaning hits (i.e. no `PageEntry`, `/pages`, `pages.json`, `listPages`, "Add blank page", etc.). Incidental matches like `PagePreview` itself are being renamed away, so there should be none left.

## File Structure

| Path | Responsibility |
|------|----------------|
| `framework/src/lib/types.ts` | `PageEntry`→`CanvasEntry`, `PagesFile`→`CanvasesFile` |
| `framework/vite-plugins/design-fs/store.ts` | Canvas-named functions; disk layout `canvases.json` + `canvases/*.tsx` |
| `framework/vite-plugins/design-fs/store.test.ts` | Assertions updated to canvas naming/paths |
| `framework/vite-plugins/design-fs/plugin.ts` | Routes `/apps/:id/pages*` → `/apps/:id/canvases*` |
| `framework/src/lib/api.ts` | `listPages/addPage/deletePage` → `listCanvases/addCanvas/deleteCanvas` |
| `framework/src/lib/canvasEvents.ts` | **New** — minimal `EventTarget` bus, event `canvases-changed` |
| `framework/src/preview/CanvasPreview.tsx` | Renamed from `PagePreview.tsx` |
| `framework/src/preview/loadCanvasModule.ts` | Renamed from `loadPageModule.ts`; glob now `canvases/*.tsx` |
| `framework/src/App.tsx` | Route `/apps/:id/pages/:pageId` → `/apps/:id/canvases/:canvasId` |
| `framework/src/features/apps/AppDetailPage.tsx` | "Pages"→"Canvases" UI, remove "All apps" button + empty-state text |
| `framework/src/features/apps/apps.css` | `.apps-page` max-width 720px → 960px |
| `framework/src/shell/SidebarShell.tsx` | Data-aware App→Canvas collapsible tree, drop "New app" link |
| `framework/src/shell/SidebarShell.css` | Tree node styles + `.sidebar-shell__main` centering |
| `apps/test-app/pages.json` → `apps/test-app/canvases.json` | Data migration (`pages` key → `canvases`) |
| `apps/test-app/pages/` → `apps/test-app/canvases/` | Data migration (dir rename, file contents unchanged) |
| `docs/dev/api/design-fs.md` | Endpoints/schema updated to canvas naming |
| `docs/dev/conventions/glossary.md` | Add "Canvas" term row |
| `apps/design/README.md` | Wording "pages" → "canvases" |

---

### Task 1: Rename domain types + content store (fs layer) + migrate test-app data

**Files:**
- Modify: `framework/src/lib/types.ts`
- Modify: `framework/vite-plugins/design-fs/store.ts`
- Modify: `framework/vite-plugins/design-fs/store.test.ts`
- Rename on disk: `apps/design/apps/test-app/pages.json` → `canvases.json` (content key `pages`→`canvases`); `apps/design/apps/test-app/pages/` → `canvases/`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - Types: `CanvasEntry { id, name, component }`, `CanvasesFile { canvases: CanvasEntry[] }`
  - Store methods: `listCanvases(appId)`, `addCanvas(appId, input)`, `deleteCanvas(appId, canvasId)` (replacing `listPages/addPage/deletePage`)
  - Internal renames: `readPagesFile`→`readCanvasesFile`, `writePagesFile`→`writeCanvasesFile`, `pagePlaceholderSource`→`canvasPlaceholderSource`. Keep `nameToComponentFile` name as-is (generic, not page/canvas-specific per spec).
  - On-disk: `<appId>/canvases.json` with top-level `"canvases"` array; components under `<appId>/canvases/*.tsx` (unchanged placeholder content shape).

- [ ] **Step 1: Update store tests to the canvas naming (RED)**

Edit `framework/vite-plugins/design-fs/store.test.ts`: rename all `store.addPage/deletePage` calls to `store.addCanvas/deleteCanvas`, change asserted paths from `'pages.json'`/`'pages'` to `'canvases.json'`/`'canvases'`, and rename local variables (`page`→`canvas`) for clarity. Keep the same four test cases (create app + empty canvases, blank name rejection, duplicate id rejection, add/delete canvas on disk, PascalCase fallback).

Run:
```bash
cd apps/design && npm test
```
Expected: FAIL (store still exports `addPage`/`listPages`/etc., writes `pages.json`).

- [ ] **Step 2: Rename types**

`framework/src/lib/types.ts`:
```ts
export type AppConfig = {
  id: string
  name: string
  path?: string
  style: string
  layout: string
}

export type CanvasEntry = {
  id: string
  name: string
  component: string
}

export type CanvasesFile = {
  canvases: CanvasEntry[]
}

export const DEFAULT_STYLE = 'dashboard'
export const DEFAULT_LAYOUT = 'sidebar-shell'
```

- [ ] **Step 3: Rename store implementation**

In `framework/vite-plugins/design-fs/store.ts`:
- Import `CanvasEntry`, `CanvasesFile` instead of `PageEntry`, `PagesFile`.
- Rename `pagePlaceholderSource` → `canvasPlaceholderSource` (keep body/signature identical, just the name and any internal "page" wording — e.g. the exported function name only; the generated placeholder source text itself has no "page" wording already: `export default function ${fn}() { return <h1>${pageName}</h1> }` — rename the parameter `pageName` → `canvasName` for clarity).
- Rename `readPagesFile`/`writePagesFile` → `readCanvasesFile`/`writeCanvasesFile`; change the resolved filename from `'pages.json'` to `'canvases.json'`.
- In `createApp`: change `fs.mkdir(resolveContentPath(dir, 'pages'))` → `resolveContentPath(dir, 'canvases')`, and `writePagesFile(dir, { pages: [] })` → `writeCanvasesFile(dir, { canvases: [] })`.
- Rename `listPages`→`listCanvases`, `addPage`→`addCanvas`, `deletePage`→`deleteCanvas`; inside each, replace `pages` directory segment with `canvases`, `data.pages` with `data.canvases`, error messages `Page already exists`/`Page not found`/`Page name is required` → `Canvas already exists`/`Canvas not found`/`Canvas name is required`, and `Invalid page id` → `Invalid canvas id`.
- Update the final returned object's keys: `listCanvases, addCanvas, deleteCanvas` (replacing `listPages, addPage, deletePage`); keep `listApps, getApp, createApp, deleteApp` unchanged.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/design && npm test
```
Expected: all tests PASS.

- [ ] **Step 5: Migrate `test-app` on-disk data**

```bash
cd apps/design/apps/test-app
mv pages canvases
python3 -c "
import json
with open('pages.json') as f:
    data = json.load(f)
data['canvases'] = data.pop('pages')
with open('canvases.json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"
rm pages.json
```

Verify:
```bash
cat apps/design/apps/test-app/canvases.json
ls apps/design/apps/test-app/canvases
```
Expected: `canvases.json` has `{"canvases": [...]}` with the same 3 entries; `canvases/` contains `Aasd.tsx`, `Asd.tsx`, `Asdfa.tsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/design/framework/src/lib/types.ts \
  apps/design/framework/vite-plugins/design-fs/store.ts \
  apps/design/framework/vite-plugins/design-fs/store.test.ts \
  apps/design/apps/test-app
git commit -m "refactor(design): rename page to canvas in types and content store"
```

---

### Task 2: Rename Vite middleware routes + browser API client

**Files:**
- Modify: `framework/vite-plugins/design-fs/plugin.ts`
- Modify: `framework/src/lib/api.ts`

**Interfaces:**
- Consumes: `store.listCanvases/addCanvas/deleteCanvas` (Task 1)
- Produces:
  - HTTP: `GET/POST /__design_fs/apps/:id/canvases`, `DELETE /__design_fs/apps/:id/canvases/:canvasId` (replacing `/pages*`)
  - `designApi.listCanvases(appId)`, `designApi.addCanvas(appId, { id, name })`, `designApi.deleteCanvas(appId, canvasId)`

- [ ] **Step 1: Update plugin routing**

In `framework/vite-plugins/design-fs/plugin.ts`:
- Replace the `if (parts[3] !== 'pages')` guard with `if (parts[3] !== 'canvases')`.
- Rename calls `store.listPages`→`store.listCanvases`, `store.addPage`→`store.addCanvas`, `store.deletePage`→`store.deleteCanvas`.
- Rename local variable `pageId` (in the `DELETE .../canvases/:canvasId` branch) → `canvasId`.
- Comments referencing `pages` in the route map (`// /__design_fs/apps/:id/pages[...]` etc.) → `canvases`.

- [ ] **Step 2: Update browser client**

In `framework/src/lib/api.ts`, replace:
```ts
listPages: (appId: string) =>
  request<PageEntry[]>(`/__design_fs/apps/${appId}/pages`),
addPage: (appId: string, body: { id: string; name: string }) =>
  request<PageEntry>(`/__design_fs/apps/${appId}/pages`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
deletePage: (appId: string, pageId: string) =>
  request<{ ok: true }>(`/__design_fs/apps/${appId}/pages/${pageId}`, {
    method: 'DELETE',
  }),
```
with:
```ts
listCanvases: (appId: string) =>
  request<CanvasEntry[]>(`/__design_fs/apps/${appId}/canvases`),
addCanvas: (appId: string, body: { id: string; name: string }) =>
  request<CanvasEntry>(`/__design_fs/apps/${appId}/canvases`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
deleteCanvas: (appId: string, canvasId: string) =>
  request<{ ok: true }>(`/__design_fs/apps/${appId}/canvases/${canvasId}`, {
    method: 'DELETE',
  }),
```
Update the top import to `import type { AppConfig, CanvasEntry } from './types'`.

- [ ] **Step 3: Manual smoke test**

```bash
cd apps/design && npm run dev
```
In another terminal:
```bash
curl -s http://localhost:5173/__design_fs/apps/test-app/canvases
curl -s -X POST http://localhost:5173/__design_fs/apps/test-app/canvases \
  -H 'content-type: application/json' -d '{"id":"smoke","name":"Smoke"}'
curl -s -X DELETE http://localhost:5173/__design_fs/apps/test-app/canvases/smoke
```
Expected: first call returns the 3 migrated entries; second returns the created entry with `component: "Smoke.tsx"`; third returns `{"ok":true}`. Confirm `apps/design/apps/test-app/canvases/Smoke.tsx` was created then removed.

- [ ] **Step 4: Commit**

```bash
git add apps/design/framework/vite-plugins/design-fs/plugin.ts apps/design/framework/src/lib/api.ts
git commit -m "refactor(design): rename design-fs routes and client methods to canvas"
```

---

### Task 3: Rename preview loader/component + front-end routes

**Files:**
- Rename: `framework/src/preview/PagePreview.tsx` → `framework/src/preview/CanvasPreview.tsx`
- Rename: `framework/src/preview/loadPageModule.ts` → `framework/src/preview/loadCanvasModule.ts`
- Modify: `framework/src/App.tsx`

**Interfaces:**
- Consumes: `designApi.listCanvases` (Task 2)
- Produces: `loadCanvasModule(appId, componentFile)`; `<CanvasPreview />` rendered at `/apps/:id/canvases/:canvasId`

- [ ] **Step 1: Rename and update the glob loader**

Create `framework/src/preview/loadCanvasModule.ts` (delete old file):
```ts
import type { ComponentType } from 'react'

const modules = import.meta.glob('../../../apps/*/canvases/*.tsx')

export async function loadCanvasModule(
  appId: string,
  componentFile: string,
): Promise<ComponentType | null> {
  const suffix = `/apps/${appId}/canvases/${componentFile}`
  const key = Object.keys(modules).find((k) => k.endsWith(suffix))
  if (!key) return null
  const loader = modules[key]
  if (!loader) return null
  const mod = (await loader()) as { default?: ComponentType }
  return mod.default ?? null
}
```

- [ ] **Step 2: Rename and update the preview component**

Create `framework/src/preview/CanvasPreview.tsx` (delete old file), adapted from the previous `PagePreview.tsx`:
```tsx
import { useEffect, useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { loadCanvasModule } from './loadCanvasModule'
import '../features/apps/apps.css'

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; Canvas: ComponentType }

const GLOB_MISS_HINT =
  'Canvas not found / restart dev server after adding files if glob cache stale'
const CANVAS_ENTRY_MISSING = 'Canvas entry not found in canvases.json'

export function CanvasPreview() {
  const { id: appId = '', canvasId = '' } = useParams<{
    id: string
    canvasId: string
  }>()
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    if (!appId || !canvasId) {
      setState({ status: 'error', message: CANVAS_ENTRY_MISSING })
      return
    }

    ;(async () => {
      try {
        const canvases = await designApi.listCanvases(appId)
        const entry = canvases.find((c) => c.id === canvasId)
        if (!entry) {
          if (!cancelled) {
            setState({ status: 'error', message: CANVAS_ENTRY_MISSING })
          }
          return
        }

        const Canvas = await loadCanvasModule(appId, entry.component)
        if (cancelled) return
        if (!Canvas) {
          setState({ status: 'error', message: GLOB_MISS_HINT })
          return
        }
        setState({ status: 'ready', Canvas })
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : GLOB_MISS_HINT,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [appId, canvasId])

  if (state.status === 'loading') {
    return <p className="apps-muted">Loading preview…</p>
  }

  if (state.status === 'error') {
    return (
      <div className="apps-page">
        <p className="apps-error">{state.message}</p>
        {appId ? (
          <p>
            <Link className="apps-btn apps-btn--ghost" to={`/apps/${appId}`}>
              Back to app
            </Link>
          </p>
        ) : null}
      </div>
    )
  }

  const { Canvas } = state
  return <Canvas />
}
```

- [ ] **Step 3: Update router**

In `framework/src/App.tsx`, replace the import/route:
```tsx
import { CanvasPreview } from './preview/CanvasPreview'
// ...
<Route path="/apps/:id/canvases/:canvasId" element={<CanvasPreview />} />
```
(remove the old `PagePreview` import and `/apps/:id/pages/:pageId` route).

- [ ] **Step 4: Manual check**

```bash
cd apps/design && npm run dev
```
Open `http://localhost:5173/apps/test-app/canvases/aasd` — expect `<h1>aasd</h1>` rendered (no console glob errors).

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/preview apps/design/framework/src/App.tsx
git commit -m "refactor(design): rename page preview to canvas preview and update routes"
```

---

### Task 4: App detail page UI rename + remove redundant elements + widen layout

**Files:**
- Modify: `framework/src/features/apps/AppDetailPage.tsx`
- Modify: `framework/src/features/apps/apps.css`

**Interfaces:**
- Consumes: `designApi.listCanvases/addCanvas/deleteCanvas`, `CanvasEntry`, `canvasEvents` (Task 5 will emit; this task's `AppDetailPage` publishes — implement the emit here referencing the not-yet-created module is acceptable since Task 5 creates it; to keep tasks independently buildable, create `canvasEvents.ts` in this task instead and have `SidebarShell`, Task 5, subscribe to it).

Note: to avoid forward-reference build breaks, **create `framework/src/lib/canvasEvents.ts` in this task**.

- [ ] **Step 1: Add the canvas change event bus**

`framework/src/lib/canvasEvents.ts`:
```ts
const target = new EventTarget()

export const CANVASES_CHANGED = 'canvases-changed'

export function emitCanvasesChanged(): void {
  target.dispatchEvent(new Event(CANVASES_CHANGED))
}

export function subscribeCanvasesChanged(listener: () => void): () => void {
  target.addEventListener(CANVASES_CHANGED, listener)
  return () => target.removeEventListener(CANVASES_CHANGED, listener)
}
```

- [ ] **Step 2: Rewrite `AppDetailPage.tsx`**

Apply these changes to the existing component (rename state/handlers, drop "All apps" button, drop empty-state paragraph, emit change event):
- Imports: `CanvasEntry` instead of `PageEntry`; add `import { emitCanvasesChanged } from '@/lib/canvasEvents'`.
- `loadAppData`: rename `pages` → `canvases`, call `designApi.listCanvases(appId)`.
- State: `pages/setPages` → `canvases/setCanvases`; `pageName/setPageName` → `canvasName/setCanvasName`; `pageId/setPageId` → `canvasId/setCanvasId`; `pageIdDirty/setPageIdDirty` → `canvasIdDirty/setCanvasIdDirty`; `pageIdValid` → `canvasIdValid`.
- `onPageNameChange`/`onPageIdChange` → `onCanvasNameChange`/`onCanvasIdChange` (same logic, renamed).
- `onAddPage` → `onAddCanvas`: call `designApi.addCanvas(appId, { id: canvasId, name: canvasName.trim() })`; on success call `emitCanvasesChanged()` in addition to `reload`.
- `onDeletePage` → `onDeleteCanvas`: confirm text `Delete canvas "${canvas.name}" (${canvas.id})?`; call `designApi.deleteCanvas(appId, canvas.id)`; on success also call `emitCanvasesChanged()`.
- Header actions: remove the `<Link className="apps-btn apps-btn--ghost" to="/">All apps</Link>` element entirely; keep only the `Delete app` button.
- Section title `<h2 className="apps-section__title">Pages</h2>` → `Canvases`.
- Remove the empty-state block:
  ```tsx
  {pages !== null && pages.length === 0 ? (
    <p className="apps-empty">No pages yet. Add a blank page below.</p>
  ) : null}
  ```
  entirely (no replacement — table branch already guards on `length > 0`; form always renders below).
- Table header/columns and row rendering: rename `page`→`canvas` throughout; link target `/apps/${appId}/pages/${page.id}` → `/apps/${appId}/canvases/${canvas.id}`; `aria-label="Delete page ${page.name}"` → `Delete canvas ${canvas.name}`.
- Form heading `Add blank page` → `Add canvas`; label `Name` stays; input `id="page-name"`→`id="canvas-name"`, `id="page-id"`→`id="canvas-id"`; hint/error text unchanged wording except "page"→"canvas" where present; submit button label `Add page`/`Adding…` → `Add canvas`/`Adding…`.
- Also rename `pages === null` loading text `Loading pages…` → `Loading canvases…`; `Failed to load pages` fallback → `Failed to load canvases`; `Failed to add page` → `Failed to add canvas`; `Failed to delete page` → `Failed to delete canvas`.
- Top-of-component lead text `App metadata and blank pages on disk.` → `App metadata and canvases on disk.`

- [ ] **Step 3: Widen and prep main content width**

`framework/src/features/apps/apps.css`:
```css
.apps-page {
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2.5);
  max-width: 960px;
  width: 100%;
}
```
(only the `max-width` value changes from `720px` to `960px`, plus add `width: 100%` so it can shrink on narrow viewports while still centering via the shell in Task 5).

- [ ] **Step 4: Manual check**

```bash
cd apps/design && npm run dev
```
Open `/apps/test-app`: header shows only "Delete app"; section title "Canvases"; table lists 3 canvases with working links; form says "Add canvas"; add a canvas named "Demo" and confirm it appears without any leftover empty-state text; delete it again.

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src/lib/canvasEvents.ts \
  apps/design/framework/src/features/apps/AppDetailPage.tsx \
  apps/design/framework/src/features/apps/apps.css
git commit -m "refactor(design): rename page UI to canvas and trim redundant app-detail UI"
```

---

### Task 5: Sidebar App→Canvas collapsible tree + main content centering

**Files:**
- Modify: `framework/src/shell/SidebarShell.tsx`
- Modify: `framework/src/shell/SidebarShell.css`

**Interfaces:**
- Consumes: `designApi.listApps/listCanvases`, `subscribeCanvasesChanged` (Task 4), `AppConfig`, `CanvasEntry`
- Produces: sidebar renders "Apps" link (→`/`) plus one collapsible node per app with its canvases as second-level links (→`/apps/:id/canvases/:canvasId`); no "New app" link.

- [ ] **Step 1: Implement the data-aware `SidebarShell`**

Replace `framework/src/shell/SidebarShell.tsx` with:
```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { subscribeCanvasesChanged } from '@/lib/canvasEvents'
import type { AppConfig, CanvasEntry } from '@/lib/types'
import './SidebarShell.css'

type SidebarShellProps = {
  children: ReactNode
}

type AppNode = {
  app: AppConfig
  canvases: CanvasEntry[]
}

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'sidebar-shell__nav-link sidebar-shell__nav-link--active'
    : 'sidebar-shell__nav-link'
}

function canvasLinkClassName({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'sidebar-shell__nav-link sidebar-shell__nav-link--canvas sidebar-shell__nav-link--active'
    : 'sidebar-shell__nav-link sidebar-shell__nav-link--canvas'
}

async function loadTree(): Promise<AppNode[]> {
  const apps = await designApi.listApps()
  const nodes = await Promise.all(
    apps.map(async (app) => {
      try {
        const canvases = await designApi.listCanvases(app.id)
        return { app, canvases }
      } catch {
        return { app, canvases: [] }
      }
    }),
  )
  return nodes
}

export function SidebarShell({ children }: SidebarShellProps) {
  const location = useLocation()
  const [nodes, setNodes] = useState<AppNode[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    loadTree().then((next) => {
      if (!cancelled) setNodes(next)
    })
    const unsubscribe = subscribeCanvasesChanged(() => {
      loadTree().then((next) => {
        if (!cancelled) setNodes(next)
      })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [location.pathname])

  function toggle(appId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) next.delete(appId)
      else next.add(appId)
      return next
    })
  }

  return (
    <div className="sidebar-shell">
      <header className="sidebar-shell__header">
        <div className="sidebar-shell__brand">
          <div className="sidebar-shell__logo" aria-hidden="true">
            D
          </div>
          <span className="sidebar-shell__title">Design Engineering</span>
        </div>
        <div className="sidebar-shell__header-spacer" />
      </header>

      <aside className="sidebar-shell__sidebar">
        <nav className="sidebar-shell__nav" aria-label="Primary">
          <NavLink to="/" end className={navLinkClassName}>
            Apps
          </NavLink>

          {nodes.map(({ app, canvases }) => {
            const isCollapsed = collapsed.has(app.id)
            return (
              <div className="sidebar-shell__app-node" key={app.id}>
                <div className="sidebar-shell__app-row">
                  <button
                    type="button"
                    className="sidebar-shell__toggle"
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed ? `Expand ${app.name}` : `Collapse ${app.name}`
                    }
                    onClick={() => toggle(app.id)}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                  <NavLink to={`/apps/${app.id}`} className={navLinkClassName}>
                    {app.name}
                  </NavLink>
                </div>

                {!isCollapsed
                  ? canvases.map((canvas) => (
                      <NavLink
                        key={canvas.id}
                        to={`/apps/${app.id}/canvases/${canvas.id}`}
                        className={canvasLinkClassName}
                      >
                        {canvas.name}
                      </NavLink>
                    ))
                  : null}
              </div>
            )
          })}
        </nav>
      </aside>

      <main className="sidebar-shell__main">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Add tree + centering styles**

In `framework/src/shell/SidebarShell.css`, replace the `.sidebar-shell__main` rule and append new rules:
```css
.sidebar-shell__main {
  grid-column: 2;
  grid-row: 2;
  overflow-y: auto;
  padding: calc(var(--space) * 2.5) calc(var(--space) * 3) calc(var(--space) * 5);
  display: flex;
  justify-content: center;
}

.sidebar-shell__app-node {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-shell__app-row {
  display: flex;
  align-items: center;
  gap: calc(var(--space) * 0.5);
}

.sidebar-shell__app-row .sidebar-shell__nav-link {
  flex: 1;
}

.sidebar-shell__toggle {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 11px;
  cursor: pointer;
  border-radius: var(--radius);
}

.sidebar-shell__toggle:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.sidebar-shell__nav-link--canvas {
  padding: 7px 12px 7px calc(var(--space) * 1.5 + 20px);
  font-size: 13px;
  font-weight: 400;
}
```
(the pre-existing `.sidebar-shell__main h1` rule below stays as-is).

- [ ] **Step 3: Manual check**

```bash
cd apps/design && npm run dev
```
- Sidebar shows "Apps" plus "Test App" with its 3 canvases (chevron ▾); clicking the chevron collapses to ▸ and hides them without navigating.
- Clicking a canvas name navigates to its preview; clicking "Test App" navigates to the detail page.
- No "New app" link remains in the sidebar.
- On a wide window, page content in `.sidebar-shell__main` is horizontally centered.
- Add/delete a canvas from the detail page (Task 4) and confirm the sidebar tree updates without a manual refresh (route stays on the same detail page, so this exercises the `canvasEvents` subscription, not just the `location.pathname` effect).

- [ ] **Step 4: Commit**

```bash
git add apps/design/framework/src/shell/SidebarShell.tsx apps/design/framework/src/shell/SidebarShell.css
git commit -m "feat(design): collapsible app/canvas sidebar tree and centered main content"
```

---

### Task 6: Docs sync (API doc, glossary, README) + final verification

**Files:**
- Modify: `docs/dev/api/design-fs.md`
- Modify: `docs/dev/conventions/glossary.md`
- Modify: `apps/design/README.md`

- [ ] **Step 1: Update `docs/dev/api/design-fs.md`**

Replace every `pages`/`Page` reference with `canvases`/`Canvas`:
- On-disk layout block: `pages.json` → `canvases.json`; `pages/` → `canvases/`.
- `pages.json` schema section heading and JSON example → `canvases.json` with `"canvases": [...]`.
- Endpoints table: `/apps/:id/pages` → `/apps/:id/canvases`, `/apps/:id/pages/:pageId` → `/apps/:id/canvases/:canvasId`; section heading "Pages" → "Canvases".
- Browser client list: `listPages(appId)`, `addPage(appId, { id, name })`, `deletePage(appId, pageId)` → `listCanvases(appId)`, `addCanvas(appId, { id, name })`, `deleteCanvas(appId, canvasId)`.
- Wording: "Adding a page appends..." → "Adding a canvas appends..."; "Deleting a page removes..." → "Deleting a canvas removes...".

- [ ] **Step 2: Add the Canvas glossary entry**

In `docs/dev/conventions/glossary.md`, replace the empty placeholder row with:
```md
# Glossary

| Term | Description |
|------|-------------|
| Canvas | A blank, previewable design surface inside an App (formerly called "page"). Backed by one entry in `<app>/canvases.json` and one `.tsx` file under `<app>/canvases/`. Not to be confused with a browser page/route. |
```

- [ ] **Step 3: Update `apps/design/README.md`**

Replace "add blank pages" / "preview page modules" / "page CRUD" wording with "add blank canvases" / "preview canvas modules" / "canvas CRUD" (see the three matches found via `search_content` for "page" in this file — update all three lines accordingly). Also update the `apps/` bullet describing `pages.json`/page `.tsx` files to `canvases.json`/canvas `.tsx` files.

- [ ] **Step 4: Full verification pass**

```bash
cd apps/design && npm test && npm run build
```
Expected: all tests PASS; production build succeeds.

```bash
cd /Users/wanderain/_my_git/design && grep -rni "page" apps/design/framework apps/design/apps docs/dev/api/design-fs.md docs/dev/conventions/glossary.md apps/design/README.md
```
Expected: no output (or only unrelated matches, e.g. none expected at all — if anything appears, fix it before moving on).

- [ ] **Step 5: Commit**

```bash
git add docs/dev/api/design-fs.md docs/dev/conventions/glossary.md apps/design/README.md
git commit -m "docs(design): sync API docs, glossary, and README to canvas terminology"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Sidebar shows all Apps, collapsible App→Canvas tree | 5 |
| Remove "New app" sidebar link (keep it on Apps list page) | 5 (removed); AppListPage already has the button, untouched |
| Main content centered, `.apps-page` 720px→960px | 4 (width), 5 (centering) |
| Remove "All apps" button on detail page | 4 |
| Remove "No pages yet..." empty-state text | 4 |
| Full page→canvas rename: types/API/disk/routes/docs/glossary | 1, 2, 3, 4, 6 |
| `test-app` data migration | 1 |
| Sidebar refresh after add/delete canvas (event bus) | 4 (emit), 5 (subscribe) |
| No aggregate endpoint; no persisted collapse state | 5 (client-side N+1 fetch, in-memory `Set`) |

## Placeholder / consistency check

- All route paths use `/apps/:id/canvases/:canvasId` consistently across `App.tsx`, `CanvasPreview.tsx`, `AppDetailPage.tsx`, `SidebarShell.tsx`.
- All HTTP paths use `/__design_fs/apps/:id/canvases...` consistently across `plugin.ts`, `api.ts`, `design-fs.md`.
- Disk layout `<appId>/canvases.json` + `<appId>/canvases/*.tsx` consistent across `store.ts`, `loadCanvasModule.ts` glob, `design-fs.md`, and the Task 1 migration.
- `nameToComponentFile` intentionally kept unrenamed (spec: generic helper, not page/canvas-specific).

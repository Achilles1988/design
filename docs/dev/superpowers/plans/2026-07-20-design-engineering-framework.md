# Design Engineering Framework (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Vite/React design engineering app under `apps/design` with a dashboard sidebar-shell management UI that creates/lists/deletes apps and blank design pages on disk under `apps/design/apps/`.

**Architecture:** Syncable code lives in `apps/design/framework/`; non-synced content lives in `apps/design/apps/<id>/`. A Vite dev-only plugin exposes a file API under `/__design_fs/*` that reads/writes only inside `apps/`. The shell loads JSON via that API and previews page components via `import.meta.glob` over the content zone.

**Tech Stack:** React 19, Vite 6, TypeScript, React Router 7, Vitest, Node `fs/promises` inside the Vite plugin.

## Global Constraints

- Follow `docs/dev/conventions/coding-standards.md` (no requirement-ID comments; reuse shared units; fix warnings in touched files).
- Follow `docs/dev/conventions/mandatory.md` (clarify before guessing; agree new dependencies with user — this plan pins the stack below).
- Shell visuals must follow `docs/design/design/rules/design.md` (dashboard tokens) and `docs/design/design/layouts/sidebar-shell/LAYOUT.md`.
- Never write outside `apps/design/apps/` from the file API; never create/delete target-repo business source paths.
- Phase-1 defaults: `style: "dashboard"`, `layout: "sidebar-shell"`.
- Do not implement install/sync scripts, style/layout pickers, or skill invocation UI.
- Spec: `docs/dev/superpowers/specs/2026-07-20-design-engineering-framework-design.md`.

## File Structure

| Path | Responsibility |
|------|----------------|
| `apps/design/package.json` | Package scripts and dependencies |
| `apps/design/tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | TS project refs |
| `apps/design/vite.config.ts` | Vite + plugin + aliases + Vitest |
| `apps/design/index.html` | SPA entry |
| `apps/design/.gitignore` | `node_modules`, `dist` |
| `apps/design/apps/.gitkeep` | Keep empty content root |
| `apps/design/framework/src/main.tsx` | React bootstrap |
| `apps/design/framework/src/App.tsx` | Router |
| `apps/design/framework/src/styles/tokens.css` | Dashboard CSS variables |
| `apps/design/framework/src/styles/global.css` | Base styles |
| `apps/design/framework/src/shell/SidebarShell.tsx` | Layout chrome |
| `apps/design/framework/src/shell/SidebarShell.css` | Shell layout styles |
| `apps/design/framework/src/lib/types.ts` | Shared domain types |
| `apps/design/framework/src/lib/slug.ts` | Name → slug helper |
| `apps/design/framework/src/lib/pathMeta.ts` | Validate optional `path` metadata |
| `apps/design/framework/src/lib/api.ts` | Browser client for `/__design_fs` |
| `apps/design/framework/src/lib/slug.test.ts` | Slug unit tests |
| `apps/design/framework/src/lib/pathMeta.test.ts` | Path-meta unit tests |
| `apps/design/framework/vite-plugins/design-fs/paths.ts` | Safe path resolve under content root |
| `apps/design/framework/vite-plugins/design-fs/store.ts` | App/page filesystem operations |
| `apps/design/framework/vite-plugins/design-fs/plugin.ts` | Vite middleware |
| `apps/design/framework/vite-plugins/design-fs/paths.test.ts` | Path safety tests |
| `apps/design/framework/vite-plugins/design-fs/store.test.ts` | Store integration tests (temp dir) |
| `apps/design/framework/src/features/apps/AppListPage.tsx` | `/` |
| `apps/design/framework/src/features/apps/AppCreatePage.tsx` | `/apps/new` |
| `apps/design/framework/src/features/apps/AppDetailPage.tsx` | `/apps/:id` |
| `apps/design/framework/src/preview/PagePreview.tsx` | `/apps/:id/pages/:pageId` |
| `apps/design/framework/src/preview/loadPageModule.ts` | `import.meta.glob` loader |
| `docs/dev/api/design-fs.md` | File API + on-disk schema notes |
| `apps/design/README.md` | How to run the design eng |

---

### Task 1: Scaffold + domain helpers (slug, pathMeta, types)

**Files:**
- Create: all scaffold files listed above under `apps/design/` except feature pages, shell, plugin store/plugin (stubs ok), preview
- Create: `framework/src/lib/types.ts`, `slug.ts`, `pathMeta.ts`, and their tests
- Create: `apps/design/apps/.gitkeep`
- Test: `framework/src/lib/slug.test.ts`, `framework/src/lib/pathMeta.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `slugify(name: string): string`
  - `isValidAppId(id: string): boolean` — `/^[a-z][a-z0-9-]*$/`
  - `validatePathMeta(path: string | undefined): { ok: true; value?: string } | { ok: false; error: string }`
  - Types: `AppConfig`, `PageEntry`, `PagesFile`

- [ ] **Step 1: Scaffold the Vite app**

From repo root:

```bash
mkdir -p apps/design/framework/src/lib apps/design/apps
cd apps/design
npm create vite@latest . -- --template react-ts
```

If `create-vite` refuses a non-empty dir, create files manually with this `package.json`:

```json
{
  "name": "@design/engineering",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.7.2",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

Move default `src/` content into `framework/src/`. Set `index.html` script to `/framework/src/main.tsx`. Write `apps/.gitkeep`. Add `.gitignore` with `node_modules`, `dist`.

`vite.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'framework/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['framework/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Install deps**

```bash
cd apps/design && npm install
```

Expected: lockfile created; no errors.

- [ ] **Step 3: Write failing tests for slug + pathMeta**

`framework/src/lib/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isValidAppId, slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify(' Hello World ')).toBe('hello-world')
  })
  it('returns empty for CJK-only names', () => {
    expect(slugify('订单中心')).toBe('')
  })
})

describe('isValidAppId', () => {
  it('accepts kebab ids', () => {
    expect(isValidAppId('orders')).toBe(true)
    expect(isValidAppId('order-center')).toBe(true)
  })
  it('rejects uppercase, leading digit, empty', () => {
    expect(isValidAppId('Orders')).toBe(false)
    expect(isValidAppId('1orders')).toBe(false)
    expect(isValidAppId('')).toBe(false)
  })
})
```

`framework/src/lib/pathMeta.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validatePathMeta } from './pathMeta'

describe('validatePathMeta', () => {
  it('allows undefined / empty as absent', () => {
    expect(validatePathMeta(undefined)).toEqual({ ok: true })
    expect(validatePathMeta('')).toEqual({ ok: true })
    expect(validatePathMeta('  ')).toEqual({ ok: true })
  })
  it('accepts relative paths', () => {
    expect(validatePathMeta('apps/orders')).toEqual({
      ok: true,
      value: 'apps/orders',
    })
  })
  it('rejects .. and absolute paths', () => {
    expect(validatePathMeta('../x').ok).toBe(false)
    expect(validatePathMeta('/abs').ok).toBe(false)
    expect(validatePathMeta('C:\\abs').ok).toBe(false)
  })
})
```

- [ ] **Step 4: Run tests — expect FAIL**

```bash
cd apps/design && npm test
```

Expected: FAIL — modules not found / exports missing.

- [ ] **Step 5: Implement types + helpers**

`framework/src/lib/types.ts`:

```ts
export type AppConfig = {
  id: string
  name: string
  path?: string
  style: string
  layout: string
}

export type PageEntry = {
  id: string
  name: string
  component: string
}

export type PagesFile = {
  pages: PageEntry[]
}

export const DEFAULT_STYLE = 'dashboard'
export const DEFAULT_LAYOUT = 'sidebar-shell'
```

`framework/src/lib/slug.ts`:

```ts
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isValidAppId(id: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(id)
}
```

`framework/src/lib/pathMeta.ts`:

```ts
export function validatePathMeta(
  path: string | undefined,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (path === undefined) return { ok: true }
  const trimmed = path.trim()
  if (!trimmed) return { ok: true }
  if (trimmed.includes('..')) {
    return { ok: false, error: 'path must not contain ..' }
  }
  if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: 'path must be a relative path' }
  }
  return { ok: true, value: trimmed }
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd apps/design && npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/design docs/dev/superpowers/plans/2026-07-20-design-engineering-framework.md
git commit -m "feat(design): scaffold apps/design with slug and path helpers"
```

---

### Task 2: Content store + path safety (testable without Vite)

**Files:**
- Create: `framework/vite-plugins/design-fs/paths.ts`
- Create: `framework/vite-plugins/design-fs/store.ts`
- Create: `framework/vite-plugins/design-fs/paths.test.ts`
- Create: `framework/vite-plugins/design-fs/store.test.ts`
- Modify: `vite.config.ts` test include already covers `framework/**/*.test.ts`

**Interfaces:**
- Consumes: `AppConfig`, `PagesFile`, `DEFAULT_*`, `isValidAppId`, `validatePathMeta`, `slugify` (store may re-validate ids)
- Produces:
  - `resolveContentPath(contentRoot: string, ...segments: string[]): string` — throws if escaped
  - `createContentStore(contentRoot: string)` with methods:
    - `listApps(): Promise<AppConfig[]>`
    - `getApp(id: string): Promise<AppConfig>`
    - `createApp(input: { id: string; name: string; path?: string }): Promise<AppConfig>`
    - `deleteApp(id: string): Promise<void>`
    - `listPages(appId: string): Promise<PageEntry[]>`
    - `addPage(appId: string, input: { id: string; name: string }): Promise<PageEntry>`
    - `deletePage(appId: string, pageId: string): Promise<void>`

- [ ] **Step 1: Write failing path + store tests**

`paths.test.ts`:

```ts
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveContentPath } from './paths'

describe('resolveContentPath', () => {
  const root = path.join(os.tmpdir(), 'design-content-root')

  it('joins safe segments', () => {
    const result = resolveContentPath(root, 'orders', 'app.json')
    expect(result).toBe(path.join(root, 'orders', 'app.json'))
  })

  it('rejects .. segments', () => {
    expect(() => resolveContentPath(root, '..', 'etc')).toThrow(/escapes/)
  })
})
```

`store.test.ts` (use `fs.mkdtemp`):

```ts
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContentStore } from './store'

describe('createContentStore', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-store-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates app with defaults and empty pages', async () => {
    const store = createContentStore(root)
    const app = await store.createApp({ id: 'orders', name: 'Orders' })
    expect(app).toMatchObject({
      id: 'orders',
      name: 'Orders',
      style: 'dashboard',
      layout: 'sidebar-shell',
    })
    const raw = await fs.readFile(path.join(root, 'orders', 'app.json'), 'utf8')
    expect(JSON.parse(raw).id).toBe('orders')
    const pages = JSON.parse(
      await fs.readFile(path.join(root, 'orders', 'pages.json'), 'utf8'),
    )
    expect(pages.pages).toEqual([])
  })

  it('rejects duplicate id', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    await expect(
      store.createApp({ id: 'orders', name: 'Orders 2' }),
    ).rejects.toThrow(/exists/)
  })

  it('adds and deletes blank pages on disk', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    const page = await store.addPage('orders', { id: 'home', name: 'Home' })
    expect(page.component).toBe('Home.tsx')
    const file = path.join(root, 'orders', 'pages', 'Home.tsx')
    await expect(fs.access(file)).resolves.toBeUndefined()
    await store.deletePage('orders', 'home')
    await expect(fs.access(file)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/design && npm test
```

Expected: FAIL — missing modules.

- [ ] **Step 3: Implement paths + store**

`paths.ts`:

```ts
import path from 'node:path'

export function resolveContentPath(
  contentRoot: string,
  ...segments: string[]
): string {
  const root = path.resolve(contentRoot)
  const resolved = path.resolve(root, ...segments)
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path escapes content root')
  }
  return resolved
}
```

`store.ts` — implement `createContentStore` using `fs/promises` + `resolveContentPath`. On `createApp`:

1. Validate `isValidAppId(id)`; throw if invalid.
2. `validatePathMeta(path)`; throw if not ok.
3. If `apps/<id>` exists → throw `App already exists`.
4. `mkdir` app dir + `pages/`.
5. Write `app.json` with defaults.
6. Write `pages.json` as `{ "pages": [] }`.

On `addPage`:

1. Validate page `id` with `isValidAppId` (same rules).
2. Component filename: PascalCase from name — e.g. `nameToComponentFile('Home') => 'Home.tsx'`. Simple rule: take `name.trim()`, split on non-alphanumeric, capitalize each part, join, append `.tsx`. If empty, use `id` PascalCase.
3. Reject if page id or component file already listed/exists.
4. Write placeholder:

```tsx
export default function Home() {
  return <h1>Home</h1>
}
```

(function name = component basename without `.tsx`)

5. Append to `pages.json`.

On `deletePage`: remove entry + delete file if present.  
On `deleteApp`: `fs.rm(appDir, { recursive: true })`.  
On `listApps`: read each subdirectory's `app.json` (skip missing/invalid with throw or skip — prefer skip dirs without `app.json`).

Export a small helper for the placeholder body so tests can assert file contents if desired.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/design && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/vite-plugins
git commit -m "feat(design): add content store and safe path resolver"
```

---

### Task 3: Vite design-fs plugin + API client

**Files:**
- Create: `framework/vite-plugins/design-fs/plugin.ts`
- Create: `framework/src/lib/api.ts`
- Modify: `apps/design/vite.config.ts` — register plugin with `contentRoot: path.resolve(__dirname, 'apps')`
- Create: `docs/dev/api/design-fs.md`

**Interfaces:**
- Consumes: `createContentStore`
- Produces:
  - `designFsPlugin(options: { contentRoot: string }): Plugin`
  - HTTP JSON API (dev only):
    - `GET /__design_fs/apps` → `AppConfig[]`
    - `GET /__design_fs/apps/:id` → `AppConfig`
    - `POST /__design_fs/apps` body `{ id, name, path? }` → `AppConfig`
    - `DELETE /__design_fs/apps/:id` → `{ ok: true }`
    - `GET /__design_fs/apps/:id/pages` → `PageEntry[]`
    - `POST /__design_fs/apps/:id/pages` body `{ id, name }` → `PageEntry`
    - `DELETE /__design_fs/apps/:id/pages/:pageId` → `{ ok: true }`
  - Browser: `designApi.listApps()`, `createApp`, `deleteApp`, `listPages`, `addPage`, `deletePage`, `getApp` — throw `Error` with server message on non-2xx

- [ ] **Step 1: Implement plugin middleware**

In `plugin.ts`, `configureServer(server)`:

```ts
import type { Plugin } from 'vite'
import { createContentStore } from './store'

export function designFsPlugin(options: { contentRoot: string }): Plugin {
  const store = createContentStore(options.contentRoot)
  return {
    name: 'design-fs',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/__design_fs')) return next()
        try {
          // parse method + path + JSON body; call store; write JSON
          // on error: status 400/404/409 with { error: message }
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}
```

Map duplicate/exists errors to **409**, not found to **404**, validation to **400**.

Wire in `vite.config.ts`:

```ts
import { designFsPlugin } from './framework/vite-plugins/design-fs/plugin'

plugins: [
  react(),
  designFsPlugin({ contentRoot: path.resolve(__dirname, 'apps') }),
],
```

- [ ] **Step 2: Implement `framework/src/lib/api.ts`**

```ts
import type { AppConfig, PageEntry } from './types'

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : res.statusText,
    )
  }
  return data as T
}

export const designApi = {
  listApps: () => request<AppConfig[]>('/__design_fs/apps'),
  getApp: (id: string) => request<AppConfig>(`/__design_fs/apps/${id}`),
  createApp: (body: { id: string; name: string; path?: string }) =>
    request<AppConfig>('/__design_fs/apps', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteApp: (id: string) =>
    request<{ ok: true }>(`/__design_fs/apps/${id}`, { method: 'DELETE' }),
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
}
```

- [ ] **Step 3: Manual smoke of API**

```bash
cd apps/design && npm run dev
```

In another terminal:

```bash
curl -s http://localhost:5173/__design_fs/apps
curl -s -X POST http://localhost:5173/__design_fs/apps \
  -H 'content-type: application/json' \
  -d '{"id":"demo","name":"Demo"}'
curl -s http://localhost:5173/__design_fs/apps/demo
```

Expected: `[]` then created app JSON then same app; files under `apps/design/apps/demo/`.

Delete the demo app via API afterward (or leave for UI tasks — prefer delete to keep tree clean):

```bash
curl -s -X DELETE http://localhost:5173/__design_fs/apps/demo
```

- [ ] **Step 4: Write `docs/dev/api/design-fs.md`**

Document endpoints, JSON schemas for `app.json` / `pages.json`, content root rule, and that writes exist only under `vite dev`.

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/vite-plugins/design-fs/plugin.ts \
  apps/design/framework/src/lib/api.ts \
  apps/design/vite.config.ts \
  docs/dev/api/design-fs.md
git commit -m "feat(design): expose Vite design-fs API and client"
```

---

### Task 4: Dashboard sidebar-shell chrome + routes

**Files:**
- Create: `framework/src/styles/tokens.css`, `global.css`
- Create: `framework/src/shell/SidebarShell.tsx`, `SidebarShell.css`
- Modify: `framework/src/main.tsx`, `App.tsx`
- Create stub pages that render titles only (replaced in Task 5–6): `AppListPage`, `AppCreatePage`, `AppDetailPage`, `PagePreview`

**Interfaces:**
- Consumes: React Router
- Produces: `SidebarShell` with slots `sidebar` / `header` / `main`; routes per spec

- [ ] **Step 1: Add design tokens from `docs/design/design/rules/design.md`**

`tokens.css`:

```css
:root {
  --color-primary: #0c5cab;
  --color-secondary: #0a4a8a;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-surface: #09090b;
  --color-text: #fafafa;
  --font-sans: 'IBM Plex Sans', system-ui, sans-serif;
  --space: 8px;
  --radius: 8px;
}
```

Import Google font or `@fontsource/ibm-plex-sans` — prefer link in `index.html` to avoid new dependency unless already agreed:

```html
<link
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 2: Implement SidebarShell**

Structure per LAYOUT.md: fixed left sidebar, fixed header, scrolling main. Dark surface background, primary for active nav.

Nav links: `Apps` → `/`, `New app` → `/apps/new`.

- [ ] **Step 3: Wire router in `App.tsx`**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SidebarShell } from './shell/SidebarShell'
import { AppListPage } from './features/apps/AppListPage'
import { AppCreatePage } from './features/apps/AppCreatePage'
import { AppDetailPage } from './features/apps/AppDetailPage'
import { PagePreview } from './preview/PagePreview'

export function App() {
  return (
    <BrowserRouter>
      <SidebarShell>
        <Routes>
          <Route path="/" element={<AppListPage />} />
          <Route path="/apps/new" element={<AppCreatePage />} />
          <Route path="/apps/:id" element={<AppDetailPage />} />
          <Route path="/apps/:id/pages/:pageId" element={<PagePreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SidebarShell>
    </BrowserRouter>
  )
}
```

Stub pages return a heading only.

- [ ] **Step 4: Visual check**

```bash
cd apps/design && npm run dev
```

Open browser: dark shell, sidebar, header, main area visible; routes change main content.

- [ ] **Step 5: Commit**

```bash
git add apps/design/framework/src
git commit -m "feat(design): add dashboard sidebar-shell and routes"
```

---

### Task 5: App list + create UI

**Files:**
- Modify: `framework/src/features/apps/AppListPage.tsx`
- Modify: `framework/src/features/apps/AppCreatePage.tsx`

**Interfaces:**
- Consumes: `designApi`, `slugify`, `isValidAppId`
- Produces: working list + create form

- [ ] **Step 1: Implement AppListPage**

On mount `designApi.listApps()`. Show table/list of `name`, `id`, optional `path`, link to `/apps/:id`. Empty state: “No apps yet” + link to create. Show fetch errors inline.

- [ ] **Step 2: Implement AppCreatePage**

Fields: `name` (required), `id` (editable, prefills via `slugify(name)` on name change unless user dirty-flagged id), `path` (optional). Submit → `designApi.createApp` → navigate to `/apps/:id`. Display API errors. Disable submit if `!isValidAppId(id)`.

- [ ] **Step 3: Manual test**

Create app `Orders` / id `orders` / path `packages/orders`. Confirm `apps/design/apps/orders/app.json` on disk and list shows it.

- [ ] **Step 4: Commit**

```bash
git add apps/design/framework/src/features/apps
git commit -m "feat(design): app list and create pages"
```

---

### Task 6: App detail + page CRUD + delete app

**Files:**
- Modify: `framework/src/features/apps/AppDetailPage.tsx`

**Interfaces:**
- Consumes: `designApi`
- Produces: detail view with page list, add form, delete confirms

- [ ] **Step 1: Implement AppDetailPage**

Load `getApp` + `listPages`. Show metadata (name, id, path, style, layout — read-only).  

Add blank page form: `name` + editable `id` (same slug UX as apps). Submit → `addPage` → refresh list.  

Each page row: link to `/apps/:id/pages/:pageId`, delete button with `confirm()`.  

Delete app button with `confirm()` → `deleteApp` → navigate `/`.

- [ ] **Step 2: Manual test**

Add page Home; confirm `pages/Home.tsx` + `pages.json`. Delete page; confirm file gone. Delete app; confirm directory gone.

- [ ] **Step 3: Commit**

```bash
git add apps/design/framework/src/features/apps/AppDetailPage.tsx
git commit -m "feat(design): app detail with blank page CRUD"
```

---

### Task 7: Blank page preview via glob

**Files:**
- Create: `framework/src/preview/loadPageModule.ts`
- Modify: `framework/src/preview/PagePreview.tsx`

**Interfaces:**
- Consumes: `designApi.listPages`, `import.meta.glob`
- Produces: renders default export of matching page module

- [ ] **Step 1: Implement loader**

```ts
const modules = import.meta.glob('../../../apps/*/pages/*.tsx')

export async function loadPageModule(
  appId: string,
  componentFile: string,
): Promise<React.ComponentType | null> {
  const suffix = `/apps/${appId}/pages/${componentFile}`
  const key = Object.keys(modules).find((k) => k.endsWith(suffix))
  if (!key) return null
  const mod = (await modules[key]()) as { default: React.ComponentType }
  return mod.default
}
```

Adjust relative glob if Vite resolves differently — verify in dev that keys include the app path.

- [ ] **Step 2: Implement PagePreview**

Read `appId`, `pageId` from params; find page entry via `listPages`; load module; render inside shell main (or full main). If missing, show “Page not found / restart dev server after adding files if glob cache stale”. Note: Vite HMR usually picks up new files; if not, document hard refresh.

- [ ] **Step 3: Manual end-to-end**

Create app → add blank page → open preview → see `<h1>…</h1>` → delete page → delete app.

- [ ] **Step 4: Commit**

```bash
git add apps/design/framework/src/preview
git commit -m "feat(design): blank page preview via import.meta.glob"
```

---

### Task 8: README + verification pass

**Files:**
- Create: `apps/design/README.md`
- Modify: ensure `docs/dev/api/design-fs.md` matches final routes

- [ ] **Step 1: Write README**

Include: purpose, `npm install` / `npm run dev` / `npm test`, directory split (`framework/` syncable vs `apps/` excluded later), pointer to spec and API doc, note that shell follows `docs/design/design`.

- [ ] **Step 2: Full verification**

```bash
cd apps/design && npm test && npm run build
```

Expected: tests PASS; production build succeeds. Write API must not be required for build. Optionally confirm `vite preview` serves UI read-only (list may fail without plugin — acceptable; document that management requires `npm run dev`).

If list fails under `preview` because plugin absent, keep behavior: plugin only in `configureServer` (dev). For build-time, UI should show a clear error when `/__design_fs` 404s (“Start with npm run dev to manage apps”).

- [ ] **Step 3: Commit**

```bash
git add apps/design/README.md docs/dev/api/design-fs.md
git commit -m "docs(design): README and verify design engineering phase 1"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| `apps/design` Vite React eng | 1 |
| `framework/` vs `apps/` split | 1–2 |
| Management UI | 4–6 |
| Shell = dashboard + sidebar-shell | 4 |
| Filesystem persistence | 2–3 |
| Vite dev file API + path safety | 2–3 |
| Name + editable id slug rules | 1, 5 |
| Optional `path` metadata validation | 1, 2, 5 |
| Hardcoded style/layout defaults | 2 |
| Blank page CRUD + placeholder file | 2, 6 |
| Blank preview | 7 |
| No target source mutations | 2 (store only under contentRoot) |
| Unit tests: path safety, slug, duplicate id | 1–2 |
| API docs under `docs/dev/api/` | 3, 8 |
| No install scripts / style picker / skills UI | (omitted) |

## Placeholder / consistency check

- API paths use `/__design_fs/...` consistently in plugin, client, and docs.
- Defaults `dashboard` / `sidebar-shell` match spec.
- Glob path `../../../apps/*/pages/*.tsx` from `framework/src/preview/` — implementer must confirm Vite key suffix; adjust finder accordingly but keep content root `apps/design/apps`.

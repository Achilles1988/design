# design-fs HTTP API

Dev-only Vite middleware that reads and writes managed design content under
`apps/design/apps/` (the plugin `contentRoot`). Mounted at `/__design_fs/*`
via `designFsPlugin` in `apps/design/vite.config.ts`.

## Availability

- Active only under `vite dev` (`configureServer`).
- `vite build` / `vite preview` do not expose write (or list) endpoints.
- The browser client (`framework/src/lib/api.ts`) treats a missing or non-JSON
  `/__design_fs` response as unavailable and surfaces:
  **Start with npm run dev to manage apps**.

## Content root

All filesystem operations resolve under `contentRoot` (`apps/design/apps`).
Paths that escape the root are rejected. The API never creates or deletes
target-repo business source trees; optional `path` on an app is metadata only.

On-disk layout:

```text
apps/design/apps/<id>/
  app.json
  pages.json
  pages/
    <PageName>.tsx
```

## On-disk schemas

### `app.json`

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Directory name; must match `^[a-z][a-z0-9-]*$` |
| `name` | string | Display name; trimmed, must be non-empty |
| `path` | string? | Optional relative path metadata (no `..`, not absolute) |
| `style` | string | Phase 1 default: `dashboard` |
| `layout` | string | Phase 1 default: `sidebar-shell` |

### `pages.json`

```json
{
  "pages": [
    { "id": "home", "name": "Home", "component": "Home.tsx" }
  ]
}
```

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Same id rules as app `id` |
| `name` | string | Display name; trimmed, must be non-empty |
| `component` | string | Filename under `pages/` (e.g. `Home.tsx`) |

Adding a page appends an entry and writes a placeholder `.tsx`. The component
filename is derived from the page name (falling back to the page id when the
derived name is not a valid TS identifier), while the placeholder `<h1>` uses
the trimmed page `name`. Deleting a page removes the entry and the component
file.

## Endpoints

Base path: `/__design_fs`

All responses are JSON. Errors use `{ "error": "<message>" }` with status:

| Condition | Status |
|-----------|--------|
| Validation / bad request | `400` |
| Missing app or page | `404` |
| Duplicate app/page/component | `409` |
| Unexpected failure | `500` |

### Apps

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps` | — | `AppConfig[]` |
| `GET` | `/apps/:id` | — | `AppConfig` |
| `POST` | `/apps` | `{ "id", "name", "path"? }` | `AppConfig` |
| `DELETE` | `/apps/:id` | — | `{ "ok": true }` |

### Pages

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps/:id/pages` | — | `PageEntry[]` |
| `POST` | `/apps/:id/pages` | `{ "id", "name" }` | `PageEntry` |
| `DELETE` | `/apps/:id/pages/:pageId` | — | `{ "ok": true }` |

## Browser client

`apps/design/framework/src/lib/api.ts` exports `designApi` with:

- `listApps()`, `getApp(id)`, `createApp({ id, name, path? })`, `deleteApp(id)`
- `listPages(appId)`, `addPage(appId, { id, name })`, `deletePage(appId, pageId)`

On non-2xx responses the client throws `Error` with the server `error` message
(or `statusText` if the body has no string `error`).

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
  canvases.json
  canvases/
    <CanvasName>.tsx
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

### `canvases.json`

```json
{
  "canvases": [
    { "id": "home", "name": "Home", "component": "Home.tsx" }
  ]
}
```

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Same id rules as app `id` |
| `name` | string | Display name; trimmed, must be non-empty |
| `component` | string | Filename under `canvases/` (e.g. `Home.tsx`) |

Adding a canvas appends an entry and writes a placeholder `.tsx`. The component
filename is derived from the canvas name (falling back to the canvas id when the
derived name is not a valid TS identifier), while the placeholder `<h1>` uses
the trimmed canvas `name`. Deleting a canvas removes the entry and the component
file.

## Endpoints

Base path: `/__design_fs`

All responses are JSON. Errors use `{ "error": "<message>" }` with status:

| Condition | Status |
|-----------|--------|
| Validation / bad request | `400` |
| Missing app or canvas | `404` |
| Duplicate app/canvas/component | `409` |
| Unexpected failure | `500` |

### Apps

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps` | — | `AppConfig[]` |
| `GET` | `/apps/:id` | — | `AppConfig` |
| `POST` | `/apps` | `{ "id", "name", "path"? }` | `AppConfig` |
| `DELETE` | `/apps/:id` | — | `{ "ok": true }` |

### Canvases

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps/:id/canvases` | — | `CanvasEntry[]` |
| `POST` | `/apps/:id/canvases` | `{ "id", "name" }` | `CanvasEntry` |
| `DELETE` | `/apps/:id/canvases/:canvasId` | — | `{ "ok": true }` |

## Browser client

`apps/design/framework/src/lib/api.ts` exports `designApi` with:

- `listApps()`, `getApp(id)`, `createApp({ id, name, path? })`, `deleteApp(id)`
- `listCanvases(appId)`, `addCanvas(appId, { id, name })`, `deleteCanvas(appId, canvasId)`

On non-2xx responses the client throws `Error` with the server `error` message
(or `statusText` if the body has no string `error`).

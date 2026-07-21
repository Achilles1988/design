# design-fs HTTP API

Dev-only Vite middleware that reads and writes managed design content under
`apps/design/apps/` (the plugin `contentRoot`), and lists/downloads static asset
packages under `framework/public/assets/` (the plugin `assetsRoot`). Mounted at
`/__design_fs/*` via `designFsPlugin` in `apps/design/vite.config.ts`.

## Availability

- Active only under `vite dev` (`configureServer`).
- `vite build` / `vite preview` do not expose write (or list) endpoints.
- The browser client (`framework/src/lib/api.ts`) treats a missing or non-JSON
  `/__design_fs` response as unavailable and surfaces:
  **Start with npm run dev to manage apps**.

## Content root

All app/canvas filesystem operations resolve under `contentRoot`
(`apps/design/apps`). Paths that escape the root are rejected. The API never
creates or deletes target-repo business source trees; optional `path` on an app
is metadata only.

On-disk layout:

```text
apps/design/apps/<id>/
  app.json
  canvases.json
  canvases/
    <CanvasName>.tsx
```

## Assets root

Asset browsing resolves under `assetsRoot`
(`apps/design/framework/public/assets`). Static HTML previews are also served by
Vite from `public/` at `/assets/<kind>/<id>/…`.

```text
apps/design/framework/public/assets/
  designmd/<id>/components.html   # plus the rest of the package
  layoutmd/<id>/preview.html      # plus the rest of the package
```

List endpoints only return packages that contain the expected preview file for
that kind. Download returns a ZIP of the whole package directory (STORE format).

### Provenance and refresh

These packages are the **authoritative style/layout stock** for Apps (see
`stylesRoot` / `layoutsRoot` in
[Design project marker and contract resolution](design-project.md)). Rule / Layout
pages browse the same tree. Apps store only package **ids** in `app.json`; install /
replace does **not** copy packages onto disk elsewhere.

The current tree was seeded by copying from the local crawl cache
`temp/designmd` and `temp/layoutmd` (gitignored Playwright / crawl output). To
refresh:

```bash
# from repo root
rsync -a --delete --exclude '.DS_Store' --exclude '_template' \
  temp/designmd/ apps/design/framework/public/assets/designmd/
rsync -a --delete --exclude '.DS_Store' --exclude '_template' \
  --exclude 'README.md' --exclude '_index.md' \
  temp/layoutmd/ apps/design/framework/public/assets/layoutmd/
```

Re-run after regenerating `temp/` from the crawl pipeline. Do not maintain a
project-local `styles/` or `layouts/` mirror of this stock.

See also: [Design project marker and contract resolution](design-project.md).

## On-disk schemas

### `app.json`

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Directory name; must match `^[a-z][a-z0-9-]*$` |
| `name` | string | Display name; trimmed, must be non-empty |
| `path` | string? | Optional relative path metadata (no `..`, not absolute) |
| `style` | string | Design-rule id under stock `stylesRoot` (default: `dashboard`) |
| `layouts` | string[] | Layout package ids under stock `layoutsRoot` (default: `["sidebar-shell"]`) |

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

### Asset entry (API)

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Package directory name |
| `name` | string | Currently same as `id` |
| `previewUrl` | string | Public URL of the preview HTML |

## Endpoints

Base path: `/__design_fs`

JSON responses use `{ "error": "<message>" }` on failure with status:

| Condition | Status |
|-----------|--------|
| Validation / bad request | `400` |
| Missing app, canvas, or asset | `404` |
| Duplicate app/canvas/component | `409` |
| Unexpected failure | `500` |

### Apps

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps` | — | `AppConfig[]` |
| `GET` | `/apps/:id` | — | `AppConfig` |
| `POST` | `/apps` | `{ "id", "name", "path"? }` | `AppConfig` |
| `DELETE` | `/apps/:id` | — | `{ "ok": true }` |
| `DELETE` | `/apps/:id/layouts/:layoutId` | — | Updated `AppConfig` (removes id from `layouts` in `app.json` only; does not delete stock packages; refuses when it would leave the list empty) |

### Canvases

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps/:id/canvases` | — | `CanvasEntry[]` |
| `POST` | `/apps/:id/canvases` | `{ "id", "name" }` | `CanvasEntry` |
| `DELETE` | `/apps/:id/canvases/:canvasId` | — | `{ "ok": true }` |

### Assets

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/assets/:kind` | — | `AssetEntry[]` (`kind`: `designmd` \| `layoutmd`) |
| `GET` | `/assets/:kind/:id/download` | — | ZIP bytes (`application/zip`) |
| `POST` | `/assets/:kind/:id/apply` | `{ "appId" }` | Updated `AppConfig` |

`POST …/apply` validates that the stock package exists under `assetsRoot`, then
updates the target App’s `app.json` only (no disk copy). The target App is
validated (`GET`-equivalent) before writing:

| `kind` | Disk mutation | `app.json` update |
|--------|---------------|-------------------|
| `designmd` | none (stock read-only) | replaces `style` with `<id>` |
| `layoutmd` | none (stock read-only) | appends `<id>` to `layouts` if missing |

## Browser client

`apps/design/framework/src/lib/api.ts` exports `designApi` with:

- `listApps()`, `getApp(id)`, `createApp({ id, name, path? })`, `deleteApp(id)`
- `removeAppLayout(appId, layoutId)` (drop a layout id from `app.json` `layouts` only; does not delete stock packages)
- `listCanvases(appId)`, `addCanvas(appId, { id, name })`, `deleteCanvas(appId, canvasId)`
- `listAssets(kind)`, `downloadAssetUrl(kind, id)` (URL helper for ZIP download)
- `applyAsset(kind, id, appId)` (install layout / replace style ids on the App)

On non-2xx JSON responses the client throws `Error` with the server `error`
message (or `statusText` if the body has no string `error`).

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

## Canvas SPA routing

On case-insensitive filesystems, a document navigation to
`/apps/<appId>/canvases/<canvasId>` can match an on-disk component such as
`Landing.tsx` when `canvasId` is `landing`, and Vite would otherwise serve the
transformed module instead of the Shell SPA. The design-fs middleware rewrites
HTML navigations (`Accept` includes `text/html`) for extension-less canvas
routes to `/index.html`. Module URLs that include a file extension (for
example `.tsx` or `.css`) are unchanged.

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
| `style` | object | `{ light?: string; dark?: string }` — design-rule ids under stock `stylesRoot`, one per theme slot; both optional (default: `{}`); the legacy single-string shape is rejected |
| `layouts` | string[] | Layout package ids under stock `layoutsRoot` (default: `["sidebar-shell"]`) |

> **Legacy `style: string`**: an `app.json` with the retired single-string
> `style` shape fails to parse (`normalizeStyleSlots` throws). `getApp`/`readAppFile`
> surfaces that as an error for the one app; `listApps` skips that app
> directory instead of failing the whole list, but logs a `console.warn`
> (server-side, dev only) naming the app id/path and the error, with a
> migration hint, so the failure stays visible instead of vanishing. Fix by
> rewriting the app's `style` field from a string id to `{ "light": "<id>" }`
> or `{ "dark": "<id>" }` (or both) in `app.json`.

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
derived name is not a valid TS identifier). Adding a Canvas writes a minimal
named TSX component that returns `null`. The preview is visually blank until the
user or Canvas Assistant authors UI. Deleting a canvas removes the entry and the
component file. Renaming a canvas updates the display name, id, and component
file under `canvases/`; validation conflicts (duplicate id or component filename)
leave disk unchanged. If the component file is renamed but writing `canvases.json`
fails, the server attempts a best-effort rollback of the file rename before
returning the error.

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
| Mutation request is not same-origin | `403` |
| Validation / bad request | `400` |
| Missing app, canvas, or asset | `404` |
| Duplicate app/canvas/component | `409` |
| Unexpected failure | `500` |

Every mutating `POST` or `DELETE` request requires `Origin` to equal
`${X-Forwarded-Proto ?? "http"}://${Host}` exactly. Sandboxed Canvas preview
documents have an opaque `Origin: null` and therefore cannot create, install,
change, or delete managed filesystem content. Normal Shell `designApi`
mutations remain same-origin and are accepted.

### Apps

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps` | — | `AppConfig[]` |
| `GET` | `/apps/:id` | — | `AppConfig` |
| `POST` | `/apps` | `{ "id", "name", "path"? }` | `AppConfig` |
| `DELETE` | `/apps/:id` | — | `{ "ok": true }` |
| `DELETE` | `/apps/:id/layouts/:layoutId` | — | Updated `AppConfig` (removes id from `layouts` in `app.json` only; does not delete stock packages; refuses when it would leave the list empty) |
| `DELETE` | `/apps/:id/style/:slot` | — | Updated `AppConfig` (`slot`: `light` \| `dark`; clears that slot in `app.json`; `400` if `slot` is not `light`/`dark`) |

### Canvases

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/apps/:id/canvases` | — | `CanvasEntry[]` |
| `POST` | `/apps/:id/canvases` | `{ "id", "name" }` | `CanvasEntry` |
| `POST` | `/apps/:id/canvases/:canvasId/rename` | `{ "id", "name" }` | `CanvasEntry` |
| `DELETE` | `/apps/:id/canvases/:canvasId` | — | `{ "ok": true }` |

### Assets

| Method | Path | Body | Success |
|--------|------|------|---------|
| `GET` | `/assets/:kind` | — | `AssetEntry[]` (`kind`: `designmd` \| `layoutmd`) |
| `GET` | `/assets/:kind/:id/download` | — | ZIP bytes (`application/zip`) |
| `POST` | `/assets/:kind/:id/apply` | `{ "appId", "slot"? }` | Updated `AppConfig`, or `409` `needsSlot` for `designmd` |

For `kind=designmd`, each `AssetEntry` includes
`slots: ('light'|'dark')[]` derived from stock `DESIGN.md` frontmatter tags via
the same polarity rules as apply (`light` only / `dark` only / both-or-neither →
both slots). Missing or unreadable contract on list defaults to both slots.
`layoutmd` entries omit `slots`.

`POST …/apply` validates that the stock package exists under `assetsRoot`, then
updates the target App’s `app.json` only (no disk copy). The target App is
validated (`GET`-equivalent) before writing:

| `kind` | Disk mutation | `app.json` update |
|--------|---------------|-------------------|
| `designmd` | none (stock read-only) | sets `style.<slot>` per polarity/`slot` (see below) |
| `layoutmd` | none (stock read-only) | appends `<id>` to `layouts` if missing |

#### `designmd` apply: polarity and slot

Every stock style package declares its **polarity** via the `tags:` sequence
in the first YAML frontmatter block of its `DESIGN.md` (or `design.md`): an
exact `light` or `dark` tag restricts the style to that theme; having both
tags (or neither) means the style supports both themes (`both`). Tags are
matched case-sensitively lowercase and exactly — e.g. `dark-accent` does not
count as `dark`.

Request body: `{ "appId": string, "slot"?: "light" | "dark" | "both" }`.

| `slot` in body | Style polarity | Result |
|----------------|-----------------|--------|
| omitted | `light` or `dark` | writes that single slot automatically; `200` |
| omitted | `both` | `409` `{ "needsSlot": true, "options": ["light","dark","both"], "error": "Choose Light, Dark, or Both for this style." }` — caller must resend with `slot` |
| `light` / `dark` | matches polarity (or polarity is `both`) | writes that one slot; `200` |
| `light` / `dark` | does not match polarity | `400` `{ "error": "This style does not support the <slot> slot." }` |
| `both` | polarity `both` | writes `style.light` and `style.dark` to the same id; `200` |
| `both` | polarity `light` or `dark` | `400` (unsupported slot) |
| anything else | — | `400` `{ "error": "slot must be light, dark, or both" }` |

## Browser client

`apps/design/framework/src/lib/api.ts` exports `designApi` with:

- `listApps()`, `getApp(id)`, `createApp({ id, name, path? })`, `deleteApp(id)`
- `removeAppLayout(appId, layoutId)` (drop a layout id from `app.json` `layouts` only; does not delete stock packages)
- `removeAppStyle(appId, slot)` (`slot`: `light` \| `dark`; clears that slot; returns updated `AppConfig`)
- `listCanvases(appId)`, `addCanvas(appId, { id, name })`, `deleteCanvas(appId, canvasId)`, `renameCanvas(appId, canvasId, { id, name })`
- `listAssets(kind)`, `downloadAssetUrl(kind, id)` (URL helper for ZIP download)
- `applyAsset(kind, id, appId, slot?)` (install layout / set style slot ids on the App; optional `slot`: `light` \| `dark` \| `both` for `designmd`)

All methods share one request path and reject with `DesignFsError` (subclass
of `Error`, so existing `catch (err) { err instanceof Error }` call sites keep
working unchanged) carrying `status` and, when the server sends them,
`needsSlot` and `options` (`StyleApplySlot[]`). Network failure or the plugin
being absent (e.g. `vite preview` / production) also throws `DesignFsError`
with message `DESIGN_FS_UNAVAILABLE`. The `409` `needsSlot` response from
`designmd` apply surfaces the same way so the UI can prompt for Light / Dark /
Both and retry with `slot`.

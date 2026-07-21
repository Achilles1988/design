# Design engineering (Phase 1)

Local Vite + React app for managing design packages on disk: create apps, add blank canvases, and preview canvas modules. The management shell follows the dashboard visual rules and `sidebar-shell` layout resolved via `design.project.json` under this tree.

## Setup

```bash
cd apps/design
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). App create/list/delete and canvas CRUD require the design-fs middleware, which only runs under `npm run dev`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server + `/__design_fs` filesystem API |
| `npm test` | Unit tests (path safety, slug, store) |
| `npm run build` | Production bundle (no write API) |
| `npm run preview` | Serve the build read-only; management API is unavailable |

## Directory layout

```text
apps/design/
  design.project.json   # Marker + roots config (see docs/dev/api/design-project.md)
  framework/            # Engineering UI, shell, preview, Vite plugin (syncable)
    public/assets/      # Read-only style/layout stock (designmd / layoutmd)
  apps/                 # Managed content root: per-app packages on disk (excluded from later sync)
```

- `design.project.json` — discovery marker for `<designRoot>` and relative roots (`stylesRoot` / `layoutsRoot` point at framework stock).
- `framework/` — product UI and tooling; intended to stay in sync with the engineering app.
- `framework/public/assets/` — authoritative App style/layout stock; Apps store only ids in `app.json`.
- `apps/` — content written by the design-fs API (`app.json`, `canvases.json`, canvas `.tsx` files). Later sync should treat this tree as workspace-local data, not framework source. The local `.gitignore` keeps generated app content out of normal commits by default.

## Docs

- Design spec: [`docs/dev/superpowers/specs/2026-07-20-design-engineering-framework-design.md`](../../docs/dev/superpowers/specs/2026-07-20-design-engineering-framework-design.md)
- HTTP API: [`docs/dev/api/design-fs.md`](../../docs/dev/api/design-fs.md)
- Design project marker: [`design.project.json`](design.project.json) · [`docs/dev/api/design-project.md`](../../docs/dev/api/design-project.md)
- Style example: [`framework/public/assets/designmd/dashboard/DESIGN.md`](framework/public/assets/designmd/dashboard/DESIGN.md)
- Layout example: [`framework/public/assets/layoutmd/sidebar-shell/LAYOUT.md`](framework/public/assets/layoutmd/sidebar-shell/LAYOUT.md)

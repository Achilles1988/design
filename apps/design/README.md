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
  styles/               # Shared style contracts: <styleId>/design.md
  layouts/              # Shared layout contracts: <layoutId>/LAYOUT.md
  apps/                 # Managed content root: per-app packages on disk (excluded from later sync)
```

- `design.project.json` — discovery marker for `<designRoot>` and relative roots.
- `framework/` — product UI and tooling; intended to stay in sync with the engineering app.
- `styles/` / `layouts/` — authoritative App contracts resolved from `app.json` `style` id and `layouts` ids.
- `apps/` — content written by the design-fs API (`app.json`, `canvases.json`, canvas `.tsx` files). Later sync should treat this tree as workspace-local data, not framework source. The local `.gitignore` keeps generated app content out of normal commits by default.

## Docs

- Design spec: [`docs/dev/superpowers/specs/2026-07-20-design-engineering-framework-design.md`](../../docs/dev/superpowers/specs/2026-07-20-design-engineering-framework-design.md)
- HTTP API: [`docs/dev/api/design-fs.md`](../../docs/dev/api/design-fs.md)
- Design project marker: [`design.project.json`](design.project.json)
- Style example: [`styles/dashboard/design.md`](styles/dashboard/design.md)
- Layout example: [`layouts/sidebar-shell/LAYOUT.md`](layouts/sidebar-shell/LAYOUT.md)
- Assets browser packages under `framework/public/assets/` are a library for Rule/Layout pages, not App contracts

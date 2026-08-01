# Design project marker and contract resolution

Public protocol for locating a design engineering installation (`<designRoot>`) and
resolving App style/layout contract paths from `design.project.json` and per-App
`app.json`.

## Purpose

- Discover `<designRoot>` in an arbitrary target repository (install path is not fixed).
- Resolve where an App lives and which markdown files define its style (required) and
  layout (preferred, optional).

Skills, scripts, and humans should use this document—not hard-coded paths such as
`apps/design`—when reasoning about contract locations.

## Discovery

From the repository root, search for files named `design.project.json` (exclude
`node_modules` and other dependency trees as appropriate).

| Match count | Behavior |
|-------------|----------|
| 0 | Error: no design project; stop. |
| 1 | Use that file’s directory as `<designRoot>`. |
| >1 | Ambiguous: ask the user which installation to use. |

Example (this repo):

```bash
find . -name design.project.json -not -path './node_modules/*' -not -path './apps/design/node_modules/*'
```

Expected: exactly one hit, e.g. `./apps/design/design.project.json`.

## Marker schema (`design.project.json`)

Located at `<designRoot>/design.project.json`.

| Field | Type | Meaning |
|-------|------|---------|
| `schemaVersion` | number | Protocol version for this file. |
| `contentRoot` | string | App content area, relative to `<designRoot>`. |
| `stylesRoot` | string | Read-only style library root, relative to `<designRoot>` (framework stock). |
| `layoutsRoot` | string | Read-only layout library root, relative to `<designRoot>` (framework stock). |
| `defaultAppId` | string | Default App id for this installation. |

Initial values in this repository:

```json
{
  "schemaVersion": 1,
  "contentRoot": "apps",
  "stylesRoot": "framework/public/assets/designmd",
  "layoutsRoot": "framework/public/assets/layoutmd",
  "defaultAppId": "design"
}
```

`stylesRoot` / `layoutsRoot` point at the framework asset library. They are **read-only
stock**: Apps reference packages by id in `app.json` only. Do not copy packages into a
project-local tree, and do not edit stock packages from the App/project side.

## Resolve formulas

Given `<designRoot>` from discovery and an App’s `app.json` (`style` is
`{ light?: string; dark?: string }`, one design-rule id per theme slot;
`layouts` is an array of ids — not paths):

- App directory: `<designRoot>/<contentRoot>/<appId>/`
- Style contract per slot (at least one slot recommended; each configured
  independently): for each of `light` and `dark`, if `app.json.style.<slot>` is
  set, resolve first existing of
  `<designRoot>/<stylesRoot>/<app.json.style.<slot>>/DESIGN.md` or `…/design.md`
- Preview resolution (falls back to the other slot when the current theme's
  slot is empty): resolve the current theme's slot; if unset, resolve the
  other slot instead
- Display resolution (no fallback): resolve only the current theme's slot;
  render "not set" when that slot is empty, even if the other slot has a value
- Layout contracts (preferred; each id optional if missing):
  `<designRoot>/<layoutsRoot>/<layoutId>/LAYOUT.md` for each entry in
  `app.json.layouts`

Stock validity: a style id is valid when its package directory contains `DESIGN.md` or
`design.md`. A layout id is preferred when its package contains `LAYOUT.md`.

The legacy single-string `style` shape is retired; there is no runtime
compatibility fallback — `app.json` files must use the `{ light?, dark? }` object.

Dev server: run `npm run dev` from `<designRoot>`. Preview URLs follow that
engineering app’s routing (e.g. `/apps/<appId>/canvases/<canvasId>`).

## Non-sources of truth

- Do **not** invent or maintain a second project-local `styles/` / `layouts/` copy of
  stock packages. Install / replace only updates `app.json` ids.
- The retired repo-level design contract directory (removed with the 2026-07-21 protocol)
  must not be used.

## See also

- [design-fs HTTP API](design-fs.md) — dev filesystem and asset listing under
  `<designRoot>`.
- [app-tokens.md](app-tokens.md) — per-App Canvas `tokens.css` fingerprint protocol

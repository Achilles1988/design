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
| `stylesRoot` | string | Shared style library root, relative to `<designRoot>`. |
| `layoutsRoot` | string | Shared layout library root, relative to `<designRoot>`. |
| `defaultAppId` | string | Default App id for this installation. |

Initial values in this repository:

```json
{
  "schemaVersion": 1,
  "contentRoot": "apps",
  "stylesRoot": "styles",
  "layoutsRoot": "layouts",
  "defaultAppId": "design"
}
```

## Resolve formulas

Given `<designRoot>` from discovery and an App’s `app.json` (`style` is an id;
`layouts` is an array of ids — not paths):

- App directory: `<designRoot>/<contentRoot>/<appId>/`
- Style contract (required): `<designRoot>/<stylesRoot>/<app.json.style>/design.md`
- Layout contracts (preferred; each id optional if missing):
  `<designRoot>/<layoutsRoot>/<layoutId>/LAYOUT.md` for each entry in
  `app.json.layouts`

Dev server: run `npm run dev` from `<designRoot>`. Preview URLs follow that
engineering app’s routing (e.g. `/apps/<appId>/canvases/<canvasId>`).

## Non-sources of truth

- `framework/public/assets/` (including `designmd/` and `layoutmd/` packages exposed via
  design-fs) is a browser preview library only. It is **not** the authoritative App
  style/layout contract source. See [design-fs](design-fs.md) provenance notes.
- The retired repo-level design contract directory (removed with the 2026-07-21 protocol) must not be used. Resolve contracts only under `<designRoot>/<stylesRoot>/` and `<designRoot>/<layoutsRoot>/` per this document.

## See also

- [design-fs HTTP API](design-fs.md) — dev filesystem and asset listing under
  `<designRoot>`.

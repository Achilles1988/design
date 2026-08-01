# App tokens (`tokens.css`)

Per-App CSS design tokens for Canvas pages, separate from Shell
`framework/src/styles/tokens.css`.

## Path

`<designRoot>/<contentRoot>/<appId>/tokens.css`

Resolved via `design.project.json` (see [design-project.md](./design-project.md)).

## Fingerprint

Header required at the top of the file. Only **configured** `app.json.style`
slots appear. Slot order: `light` then `dark` when both exist.

Hash = SHA-256 hex of the resolved stock `DESIGN.md` or `design.md` **file bytes**.

```css
/* @app-tokens fingerprint
 * light:<styleId>:<sha256>
 * dark:<styleId>:<sha256>
 */
```

## Theme blocks

Emit selectors only for configured slots:

- light → `[data-theme='light'] { ... }`
- dark → `[data-theme='dark'] { ... }` (may also set `:root` to the App's default polarity when documenting generation)

Minimum variables: `--color-primary`, `--color-surface`, `--color-surface-2`,
`--color-text`, `--color-border`, `--color-muted`, `--color-success`,
`--color-warning`, `--color-danger`, `--font-sans`.

Canvas code imports this file and uses `var(--*)`. Follow `<html data-theme>`
from Shell theme toggle; do not add a Canvas-local theme switch.

## Who writes vs who checks

| Actor | May write `tokens.css`? | May parse DESIGN.md body? |
|-------|-------------------------|---------------------------|
| Agent (`wn-design-requirement`) | Yes, on missing/stale | Yes |
| Skill scripts `check-app-tokens` | No | No (hash file bytes only) |
| Shell `sync:tokens` | No (Shell file only) | Shell only |

## Check CLI

From repo (paths relative to skill):

```bash
node .wn-ai/skills/wn-design-requirement/scripts/check-app-tokens.mjs <designRoot> <appId>
```

Exit `0` when fingerprint matches; `1` when missing/stale/invalid style.

## See also

- [design-project.md](./design-project.md)
- [shell-tokens.md](./shell-tokens.md) — Shell chrome only

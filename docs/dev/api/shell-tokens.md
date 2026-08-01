# Shell tokens sync

How the design engineering **Shell** keeps `framework/src/styles/tokens.css` aligned with the design App's configured style contracts.

## Source of truth

The design App at `apps/design/apps/design/app.json` defines theme slots:

```json
{
  "style": {
    "light": "default",
    "dark": "dashboard"
  }
}
```

Each slot id resolves to a stock package under `framework/public/assets/designmd/<id>/DESIGN.md`.

## Generated vs hand-maintained

`tokens.css` has two regions:

| Region | Maintained by |
|--------|-------------|
| Typography scale, spacing, radius, motion (`:root` static block) | Hand-edited |
| Color and `--font-sans` per theme | `scripts/sync-shell-tokens.mjs` between `@generated colors:start` / `@generated colors:end` markers |

Semantic tokens derived from palette (`--color-border`, `--color-muted`, overlay/shadow) are emitted by the script using fixed rules documented in the shell token alignment spec.

## Commands

From `apps/design`:

```bash
npm run sync:tokens        # rewrite generated blocks in tokens.css
npm run sync:tokens:check  # exit 1 if tokens.css drifts from app.json + DESIGN.md
```

## When to run

- After changing `app.json` style slot ids for the design App
- After updating color or typography bullets in the linked `DESIGN.md` packages (when those values should flow into Shell chrome)
- In CI via `sync:tokens:check` to prevent drift

## Scope

Shell chrome only (sidebar, apps/settings/assets pages, assistant, dialogs). Asset preview iframe content and canvas generated pages use each App's installed style contract, not this file.

## See also

- [design-project.md](./design-project.md) — style slot resolution
- Spec: `docs/dev/superpowers/specs/2026-08-01-shell-token-alignment-design.md`

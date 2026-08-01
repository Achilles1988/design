# Shell Token Alignment with App Style Contracts

Date: 2026-08-01  
Status: Approved for implementation planning  
Scope: `apps/design/framework` Shell UI (excluding asset package content)

## Goal

Align all Shell chrome styling with a single token source (`framework/src/styles/tokens.css`) whose light and dark values are derived from the design App's configured style slots in `apps/design/apps/design/app.json`:

- **light** → `default` (`framework/public/assets/designmd/default/DESIGN.md`)
- **dark** → `dashboard` (`framework/public/assets/designmd/dashboard/DESIGN.md`)

Extend the token system to cover colors, typography, spacing, radius, elevation, and motion. Replace hardcoded values across Shell CSS files. Add a sync script so `tokens.css` does not drift when `app.json` style ids change.

## Context

- Shell uses `data-theme="light|dark"` (`framework/src/lib/theme.ts`) and imports `tokens.css` via `global.css`.
- `tokens.css` was originally copied from `dashboard` only. Light theme values still reflect dashboard hues (e.g. primary `#0c5cab`) instead of `default` (accent `#2F6FEB`).
- Shell CSS audit found bare hex colors (`#fff`, `#000` in overlays), many bare `font-size: Npx` values, and ad-hoc radius values not mapped to tokens.
- Asset browser **chrome** (cards, filters, lightbox frame) is Shell; asset **preview iframe content** inside stock packages is out of scope.
- Canvas **generated page content** follows the target App's installed style contract, not Shell tokens. Canvas **Shell chrome** (`canvasReveal.css`, preview frame bootstrap) is in scope.

## Decisions

| Topic | Decision |
|-------|----------|
| Source of truth | `apps/design/apps/design/app.json` style slots → respective `DESIGN.md` packages |
| Token file | `framework/src/styles/tokens.css` (generated header in Phase 2) |
| Theme mapping | `[data-theme='light']` ← `style.light`; `:root` + `[data-theme='dark']` ← `style.dark` |
| Token depth | Full system: color, typography, spacing, radius, elevation, transition |
| Typography migration | Map non-scale px to canonical scale (13→14, 18→20, 10/11→12, 15→16) |
| Light secondary color | No separate secondary in `default`; `--color-secondary` equals `--color-primary` in light |
| Sync mechanism | Phase 1 manual rewrite; Phase 2 `scripts/sync-shell-tokens.mjs` + `npm run sync:tokens` |
| Public API docs | Add `docs/dev/api/shell-tokens.md` when sync script lands (same change) |
| User-facing copy | English (unchanged) |

## Token schema

### Colors

| Variable | Light (`default`) | Dark (`dashboard`) |
|----------|-------------------|---------------------|
| `--color-primary` | `#2F6FEB` | `#0C5CAB` |
| `--color-primary-content` | `#2F6FEB` | `#67A9E7` |
| `--color-secondary` | `#2F6FEB` | `#0A4A8A` |
| `--color-success` | `#17A34A` | `#10B981` |
| `--color-warning` | `#EAB308` | `#F59E0B` |
| `--color-danger` | `#DC2626` | `#EF4444` |
| `--color-surface` | `#FAFAFA` | `#09090B` |
| `--color-surface-2` | `#FFFFFF` | `color-mix(in srgb, var(--color-text) 6%, var(--color-surface))` |
| `--color-text` | `#111111` | `#FAFAFA` |
| `--color-border` | `#E5E5E5` | `color-mix(in srgb, var(--color-text) 12%, transparent)` |
| `--color-muted` | `#6B6B6B` | `color-mix(in srgb, var(--color-text) 55%, transparent)` |
| `--color-on-primary` | `#FFFFFF` | `#FFFFFF` |
| `--color-overlay` | `color-mix(in srgb, #111111 45%, transparent)` | `color-mix(in srgb, #000000 45%, transparent)` |
| `--shadow-elevated` | `0 2px 8px color-mix(in srgb, #111111 8%, transparent)` | `0 16px 48px color-mix(in srgb, #000000 28%, transparent)` |
| `--shadow-modal` | `0 24px 64px color-mix(in srgb, #111111 20%, transparent)` | `0 24px 64px color-mix(in srgb, #000000 45%, transparent)` |

Overlay/shadow bases use fixed neutrals (`#111` light scrim, `#000` dark scrim) because scrims are viewport-level, not palette accents.

### Typography

| Variable | Light | Dark |
|----------|-------|------|
| `--font-sans` | `'Inter', -apple-system, system-ui, sans-serif` | `'IBM Plex Sans', system-ui, sans-serif` |
| `--font-mono` | `ui-monospace, 'JetBrains Mono', monospace` | same |
| `--font-weight-normal` | `400` | `400` |
| `--font-weight-medium` | `500` | `500` |
| `--font-weight-semibold` | `600` | `600` |
| `--line-height-body` | `1.5` | `1.5` |
| `--line-height-heading` | `1.2` | `1.2` |

Size scale (both themes):

| Variable | Value | Replaces |
|----------|-------|----------|
| `--text-xs` | `12px` | 10, 11, 12px |
| `--text-sm` | `14px` | 13, 14px |
| `--text-base` | `14px` | body default |
| `--text-md` | `16px` | 15, 16px |
| `--text-lg` | `20px` | 18, 20px |
| `--text-xl` | `24px` | 24px |
| `--text-2xl` | `32px` | reserved |

### Spacing, radius, motion

```css
--space: 8px;
--sidebar-w: 256px;
--header-h: 60px;
--radius-sm: 4px;
--radius: 8px;
--radius-md: 12px;
--radius-full: 999px;
--radius-circle: 50%;
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
```

Ad-hoc spacing maps to `calc(var(--space) * N)`:

| Original | Target |
|----------|--------|
| 2px, 3px | `calc(var(--space) * 0.25)` or `* 0.5` |
| 7px, 9px | `calc(var(--space) * 1)` |
| 12px | `calc(var(--space) * 1.5)` |

## In-scope files

```
framework/src/styles/tokens.css
framework/src/styles/global.css
framework/src/shell/SidebarShell.css
framework/src/shell/assistant/assistant.css
framework/src/features/apps/apps.css
framework/src/features/assets/assets.css      /* chrome only */
framework/src/features/settings/settings.css
framework/src/ui/FormRow.css
framework/src/ui/SectionHeader.css
framework/src/ui/DisclosureForm.css
framework/src/ui/ConfirmTipHost.css
framework/src/ui/ChooseStyleSlotHost.css
framework/src/preview/canvasReveal.css
```

## Out of scope

- Stock asset packages under `framework/public/assets/designmd/` and `layoutmd/` (including preview HTML/CSS inside packages)
- Asset lightbox iframe document content
- Canvas module generated page styling (App style contract)

## CSS migration rules

**Must replace:**

- Bare `#fff`, `#000`, and other hex outside `tokens.css`
- `font-size: Npx` → `var(--text-*)`
- `border-radius: 4px` → `var(--radius-sm)`; `6px` → keep or use nearest token; `999px` → `var(--radius-full)`; `50%` → `var(--radius-circle)`
- Hardcoded monospace stacks in `assistant.css` → `var(--font-mono)`
- Modal scrim/shadow `#000` mixes → `var(--color-overlay)`, `var(--shadow-modal)`, `var(--shadow-elevated)`
- Primary button `color: #fff` → `var(--color-on-primary)`

**Keep as-is:**

- `margin: 0; padding: 0` resets
- `1px` border widths
- `color-mix(...)` expressions that already reference token variables

**Migration order:**

1. `tokens.css`, `global.css`
2. Shared `ui/*.css`
3. `SidebarShell.css`
4. `features/*.css`
5. `assistant.css`
6. `canvasReveal.css`

## Sync script (Phase 2)

`scripts/sync-shell-tokens.mjs`:

1. Read `apps/design/apps/design/app.json` → `style.light`, `style.dark`
2. Resolve `<designRoot>/framework/public/assets/designmd/<id>/DESIGN.md` for each slot
3. Parse Color and Typography sections (regex on known bullet patterns)
4. Emit `framework/src/styles/tokens.css` with a generated-file banner
5. Exit non-zero if parsed values differ from committed file (CI check mode)

Commands:

- `npm run sync:tokens` — write tokens
- Optional: hook `predev` / `pretest` to regenerate

Document the script and manual override policy in `docs/dev/api/shell-tokens.md`.

## Acceptance criteria

- [ ] `tokens.css` light values match `default/DESIGN.md` colors and fonts
- [ ] `tokens.css` dark values match `dashboard/DESIGN.md` colors and fonts
- [ ] No bare hex in Shell CSS except inside `tokens.css` definitions
- [ ] No bare `font-size: Npx` in Shell CSS
- [ ] Overlays, shadows, and primary-button text use semantic tokens
- [ ] Light/dark toggle produces correct palette and font family on Sidebar, Apps, Assets chrome, Settings, Assistant, dialogs
- [ ] `npm run test` passes
- [ ] `npm run sync:tokens` is idempotent (empty diff after generation)

## Risks

| Risk | Mitigation |
|------|------------|
| 13px→14px, 18px→20px visual shift | Acceptable per canonical scale; verify in both themes |
| Font family changes on theme switch | Intended — each slot defines its own family |
| DESIGN.md parse fragility | Parse only structured Color/Typography bullets; fail loudly on missing fields |
| `app.json` style ids change | Sync script regenerates tokens; CI catches drift |

## See also

- [design-project.md](../../api/design-project.md) — style slot resolution
- [2026-07-31-dual-theme-styles-design.md](./2026-07-31-dual-theme-styles-design.md) — dual slot model
- [2026-07-24-interface-consistency-and-assistant-docking-design.md](./2026-07-24-interface-consistency-and-assistant-docking-design.md) — dashboard token mandate for assistant

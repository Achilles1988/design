# wn-design-requirement Skill Design

Date: 2026-08-01  
Status: Approved for implementation planning  
Scope: Project skill that creates or updates App Canvases from user requirements and style contracts; per-App `tokens.css`; replaces `wn-design-prd` as the sole Canvas authoring entry skill

## Goal

Provide a lean IDE skill (`wn-design-requirement`) that:

1. Locates the design engineering project (or stops with an install hint).
2. Identifies the target App (asks if unclear).
3. Verifies the App has valid style slot configuration (otherwise reminds the user to configure first).
4. Distinguishes create vs modify Canvas work.
5. Ensures an App-owned `tokens.css` exists and matches configured `DESIGN.md` sources via fingerprint (agent regenerates when missing/stale).
6. Clarifies user intent, then implements a previewable Canvas that follows App tokens + DESIGN.md, supports configured light/dark via shell `data-theme`, and uses fake data.

Core success criterion: the user gets the UI they asked for. This skill does not own worktrees, requirement packs, code review, design-review gates, or multi-skill orchestration—users compose other skills themselves if they want those workflows.

## Context

- Discovery and style/layout resolution are defined by `docs/dev/api/design-project.md` (`design.project.json`, `app.json.style` as `{ light?: string; dark?: string }`).
- Existing `wn-design-prd` is a heavy Canvas orchestrator (pack HARD-GATE, worktree, CR, screenshot design review, non-UI handoff). This design **replaces** it as the Canvas authoring entry.
- Shell tokens live at `framework/src/styles/tokens.css` and are synced only for Shell chrome (`docs/dev/api/shell-tokens.md`). They are **not** the App Canvas token source.
- Current Canvas files may hardcode colors; new work under this skill must use App `tokens.css` variables.
- `DESIGN.md` packages under `stylesRoot` are stock and format-loose; automatic parsers are unreliable for generation.

## Decisions

| Topic | Decision |
|-------|----------|
| Relation to `wn-design-prd` | Replace as sole Canvas authoring entry; delete or stub-redirect the old skill |
| Process gates | None of pack / approval / worktree / CR / design-review / handoff |
| App tokens path | `<designRoot>/<contentRoot>/<appId>/tokens.css` — one file per App |
| Token sources | 1–2 configured style slots; each slot maps to one stock `DESIGN.md` / `design.md` |
| Stale detection | Fingerprint header (slot → style id + content hash); missing or mismatch → regenerate |
| Token generation | Agent reads DESIGN.md and writes `tokens.css`; scripts never parse DESIGN.md body or write tokens |
| Checks | Scriptable: find design root, list apps, validate style slots, check token fingerprint |
| Mainline | Agent-driven intent recognition and implementation |
| Theme linkage | CSS variables under `[data-theme='light'|'dark']`; follow `<html data-theme>`; shell theme toggle must update Canvas |
| Dual theme | Implement every configured slot; do not invent the missing polarity |
| Style gate | If no valid style slot, stop and tell user to configure; skill does not install styles |
| Visual / URL references | Before implementing, ask user to pick mode 1 / 2 / 3 (below); **all modes still must obey App tokens + DESIGN.md** |
| Layout | Prefer installed `layouts` contracts; may blend if none fit (preference, not hard fail) |
| Fake data | Always fill realistic placeholder content; no real backend |
| Shell / framework edits | Out of scope |
| Public API docs | Add `docs/dev/api/app-tokens.md` in the same change as the protocol lands |

## Reference fidelity modes

When the user supplies images and/or reference links, ask **before** implementation:

1. **Exact copy** — match the reference as closely as possible.
2. **Redesign components** — keep the original functionality; components may be redesigned.
3. **Creative reference only** — use interaction and layout as inspiration only.

In all three modes, colors, typography, spacing, motion, and related visuals **must** follow the App's `tokens.css` and configured DESIGN.md. Exact copy does not authorize off-spec hex/fonts.

## Pipeline

Agent-driven; stop or ask on blockers. Prefer calling check scripts where available.

1. **Find design project** — search for `design.project.json` (ignore dependency trees).  
   - 0 → stop; tell user to install a design-engineering project.  
   - >1 → ask which `<designRoot>`.  
   - 1 → proceed; read marker fields.
2. **Identify App** — from user intent; if unclear, ask (may suggest `defaultAppId`).
3. **Validate styles** — `app.json.style` must have at least one slot whose id resolves to stock `DESIGN.md` / `design.md`. Else stop; remind user to configure styles first.
4. **Create vs modify** — lock action and target Canvas id(s); ask if unclear.
5. **App tokens** — if `tokens.css` missing or fingerprint stale vs current configured slots' DESIGN.md hashes, agent regenerates the full file (including only configured slots), then continue.
6. **Clarify requirement** — ask until implementable; if images/links present, force mode 1/2/3 first.
7. **Implement** — write/update Canvas (+ CSS as needed), sync `canvases.json` on add/delete, use App tokens + DESIGN.md, fake data, theme via `data-theme`. Restart `npm run dev` from `<designRoot>` after adding a new Canvas when preview requires it.

## App Token protocol

### Path

`<designRoot>/<contentRoot>/<appId>/tokens.css`

Independent of Shell `framework/src/styles/tokens.css`.

### Fingerprint

Machine-readable file header listing each **configured** slot:

- `slot`: `light` | `dark`
- style id from `app.json.style.<slot>`
- content hash: SHA-256 hex of the resolved DESIGN.md / design.md file bytes

Canonical header shape (only configured slots appear; order `light` then `dark` when both exist):

```css
/* @app-tokens fingerprint
 * light:<styleId>:<sha256>
 * dark:<styleId>:<sha256>
 */
```

Example (both slots):

```css
/* @app-tokens fingerprint
 * light:default:aeba1b5aa9db00f7e08616c0ffb2ee3408ff96edaa2fc26709743eecf13045d7
 * dark:dashboard:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
 */
```

Script `check-app-tokens`: recompute hashes for configured slots; fail if file missing, header missing/unparsable, style id changed, or hash mismatch. Does not read token values for equality and does not write the file.

### File body

- Optional shared static scale (type sizes, space, radius, motion) distilled from DESIGN.md.
- Theme blocks only for configured slots:
  - light → `[data-theme='light'] { ... }`
  - dark → `[data-theme='dark'] { ... }` (may group with `:root` as default when aligning with Shell conventions)
- Minimum semantic names aligned with Shell for familiarity:  
  `--color-primary`, `--color-surface`, `--color-surface-2`, `--color-text`, `--color-border`, `--color-muted`, `--color-success`, `--color-warning`, `--color-danger`, `--font-sans`.  
  Add more roles when DESIGN.md provides them; do not invent colors that contradict the contract.
- Canvas (and its CSS) imports this file and uses `var(--*)` only for themed values—no ad-hoc off-spec palette.

### Generation (agent only)

On missing/stale: Read each configured DESIGN.md, map roles into the schema, write complete `tokens.css` with a fresh fingerprint. If mapping is ambiguous, ask the user; do not invent a conflicting palette.

### Runtime vs Shell tokens

Shell theme (`framework/src/lib/theme.ts`) sets `document.documentElement` `data-theme`. Canvas must respond to that attribute. Preview may still inject Shell tokens for chrome; App `tokens.css` must dominate Canvas page styling so the two sources do not fight for the page surface. Implementation plan should verify against the current preview bootstrap.

## Scripts

Under `.wn-ai/skills/wn-design-requirement/scripts/` (names may be adjusted in the plan; responsibilities fixed):

| Script | Responsibility |
|--------|----------------|
| find-design-root | Locate `design.project.json`; report 0 / 1 / many |
| list-apps | List apps under `contentRoot` |
| check-app-style | At least one valid style slot for the given App |
| check-app-tokens | `tokens.css` present and fingerprint matches current DESIGN.md hashes |

Stable exit codes and human-readable stdout/stderr for agent consumption.

## Artifacts

```text
.wn-ai/skills/wn-design-requirement/
├── SKILL.md
├── README.md
└── scripts/
    └── … (check helpers above)

docs/dev/api/app-tokens.md
docs/dev/superpowers/specs/2026-08-01-wn-design-requirement-design.md  # this file
```

`wn-design-prd`: remove or replace with a short stub that points to `wn-design-requirement`. Stale plan/fixture references cleaned during implementation planning—not a blocker for the skill MVP.

## Error handling

| Condition | Behavior |
|-----------|----------|
| No design project marker | Stop; install hint |
| Ambiguous design roots | Ask which to use |
| Ambiguous App | Ask (may suggest default) |
| Invalid / empty style | Stop; configure styles first |
| Missing / stale tokens | Agent regenerates, then continues |
| Images/links without mode 1/2/3 | Ask before coding |
| Unclear product UI intent | Keep asking; do not guess major structure |
| Request to edit shell/framework | Refuse in this skill; user may use other skills |

## Testing / verification

- Script unit/fixture checks: no marker → non-zero; bad style → non-zero; stale fingerprint → non-zero; valid App + matching fingerprint → zero.
- Skill pressure scenarios (subagent or manual): missing project exits; unconfigured style stops; reference assets trigger mode question and still enforce style; dual-slot Canvas tracks shell theme toggle; single-slot does not fabricate the other polarity; fake data present; create updates `canvases.json`.

## Non-goals

- Requirement pack files and HARD-GATE approval loops
- Git worktree isolation, code-review, or design-review orchestration
- Non-UI requirement conservation / curated handoff prompts
- Installing or editing stock style/layout packages
- Parsing DESIGN.md inside check scripts
- Editing Shell chrome or framework sources
- Real data backends or auth

## See also

- `docs/dev/api/design-project.md` — discovery and style slot resolution
- `docs/dev/api/shell-tokens.md` — Shell-only token sync (not App Canvas)
- `.wn-ai/lessons/lesson.md` — style mandatory; dual-slot rules; layout preference

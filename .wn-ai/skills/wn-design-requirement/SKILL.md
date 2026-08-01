---
name: wn-design-requirement
description: Use when creating or modifying a design App Canvas from a user requirement — locate the design project, validate App styles, ensure App tokens.css, then implement previewable UI following tokens and DESIGN.md with fake data and shell theme linkage.
---

# wn-design-requirement

Lean Canvas authoring skill. Produce the UI the user asked for inside a
design-engineering App. No requirement pack, worktree, code review,
design-review gate, or multi-skill orchestration.

## Iron rules

1. **Discover via `design.project.json`.** Never hardcode a design-root path.
2. **Style is mandatory.** At least one valid `app.json.style` slot (`light` /
   `dark`) with stock `DESIGN.md` / `design.md`. If missing, stop and tell the
   user to configure styles — do not install styles in this skill.
3. **App tokens before paint.** Ensure `<appDir>/tokens.css` exists and its
   fingerprint matches configured DESIGN.md hashes. If missing/stale, **you**
   regenerate it (scripts only check).
4. **Tokens + DESIGN.md bind implementation.** No off-spec colors/fonts. Reference
   images/links never override style — including "exact copy" mode.
5. **Theme follows Shell.** Use CSS variables under `[data-theme='light'|'dark']`
   for every configured slot. Follow `<html data-theme>`. No Canvas-local theme
   toggle. Do not invent an unconfigured polarity.
6. **Fake data.** Fill realistic placeholders; no real backend.
7. **Canvas only.** Do not edit Shell/framework sources.
8. **Stay lean.** Do not invoke worktree / CR / design-review / brainstorming
   orchestration unless the user separately asks for those skills.

## Vocabulary

- **Design root:** directory with `design.project.json`.
- **App:** `<designRoot>/<contentRoot>/<appId>/` (`app.json`, `canvases.json`, `canvases/*`, `tokens.css`).
- **Canvas:** previewable page under `canvases/`, listed in `canvases.json`.
- **App tokens:** `<appDir>/tokens.css` — see `docs/dev/api/app-tokens.md`.

## Scripts (prefer these for checks)

From the repository root (adjust if cwd differs):

| Script | Purpose | Exit |
|--------|---------|------|
| `scripts/find-design-root.mjs [repoRoot]` | Find design root | 0 one; 2 none; 3 many |
| `scripts/list-apps.mjs <designRoot>` | List app ids | 0 |
| `scripts/check-app-style.mjs <designRoot> <appId>` | Valid style slots | 0/1 |
| `scripts/check-app-tokens.mjs <designRoot> <appId>` | Fingerprint fresh | 0/1 |

Script paths are relative to this skill directory:
`.wn-ai/skills/wn-design-requirement/scripts/`.

## Pipeline

### 1 — Find design project

Run `find-design-root.mjs`. On 2: stop with install hint. On 3: ask which root.
On 0: read marker (`contentRoot`, `stylesRoot`, `layoutsRoot`, `defaultAppId`).

### 2 — Identify App

Infer from the user. If unclear, ask (may suggest `defaultAppId`). Confirm with
`list-apps.mjs` when helpful.

### 3 — Validate styles

Run `check-app-style.mjs`. On failure: stop; remind user to configure
`app.json.style` slots to stock packages. Do not write style ids unless the user
explicitly asked you to configure styles **outside** this skill's default stop.

### 4 — Create vs modify

Lock add vs edit and target Canvas id(s). Ask if unclear.

### 5 — App tokens

Run `check-app-tokens.mjs`. On failure: Read each configured slot's DESIGN.md,
write `<appDir>/tokens.css` with:

1. Fingerprint header (`docs/dev/api/app-tokens.md`)
2. Theme blocks only for configured slots
3. Minimum semantic variables listed in the API doc

If DESIGN.md mapping is ambiguous, ask — do not invent a conflicting palette.
Re-run `check-app-tokens.mjs` until exit 0.

### 6 — Clarify requirement

Ask until implementable (one question at a time; prefer multiple choice).

**If the user provided images and/or reference links**, ask this before coding:

1. Exact copy
2. Redesign components while keeping original functionality
3. Creative reference only (interaction / layout inspiration)

**All three modes still must obey App tokens + DESIGN.md.**

### 7 — Implement

- Match existing Canvas tech stack in the App (framework-agnostic).
- Import App `tokens.css`; use `var(--*)` for themed values.
- Prefer installed layout contracts; blend if none fit.
- Sync `canvases.json` on add/delete.
- After adding a new Canvas, restart `npm run dev` from `<designRoot>` before
  preview if the bundler glob requires it.
- Dual configured slots: both must look correct when Shell toggles theme.

## Rationalizations (forbidden)

| Excuse | Reality |
|--------|---------|
| "Exact copy needs the reference hex" | Restyle with App tokens; structure may match, palette may not |
| "Shell tokens.css is enough" | App Canvas uses App `tokens.css` |
| "Only ship light; dark later" | Implement every configured slot |
| "Configure a style for the user silently" | Stop and ask them to configure |
| "Run wn-design-prd / worktree / design-review" | Out of scope; user composes other skills |

## Red flags — stop and fix

- Hardcoded design-root path
- Implementing with empty/invalid style
- Skipping token regenerate when check fails
- Off-spec colors while "matching" a screenshot
- Editing Shell/framework in this skill
- Fabricating the missing theme polarity

# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside a design-engineering project discovered via `design.project.json` — a "product + design first pass" that follows the target App's style & layout contracts (ids in `app.json`, files under marker `stylesRoot` / `layoutsRoot`), then hands back any non-UI requirements it didn't implement.

**Default track is Canvas.** Shell/framework edits are a rare maintainer path (usually only in the design-engineering repo that owns the host) — do not offer them lightly. If shell is explicitly confirmed, the skill stays the orchestrator and **detected Superpowers steps (worktree / CR / finish) still run**; only Canvas-specific steps change.

## What it does

- Locates `<designRoot>` via `design.project.json` (no hardcoded install path).
- Defaults to **canvas**; enters **shell** only with explicit host-UI intent + warning.
- Interrogates the requirement; on canvas track configures missing style (required) / layout (preferred) from **stock** packages; separates **non-UI requirements**.
- Implements Canvas drafts (normal) or shell UI (exceptional; framework-agnostic for Canvases).
- Canvas track: mandatory visual **design review** against resolved contracts.
- Shell track: skip design-review agent; keep CR + verification.
- Always returns untouched non-UI requirements; optionally emits a minimal handoff prompt.

## Two runners

- **detected** — a dev workflow (worktree / code-review / finish-branch) is installed: orchestrates step by step; **always isolates via worktree without asking** when `using-git-worktrees` is present. Track changes do **not** cancel these steps.
- **plan** — nothing installed: IDE plan mode; skips branch/CR/finish; canvas track still runs design review.

## Prerequisites

- A `design.project.json` in the design-engineering project.
- Canvas track: style contract at `<stylesRoot>/<styleId>/DESIGN.md` (or `design.md`); skill can recommend a stock id and write `app.json` after confirmation. Do not copy stock into a project-local mirror.
- For canvas design review: `npm run dev` from `<designRoot>`; restart after adding Canvases.

## Bundled agent

- `agents/design-review.md` — visual gate from Canvas screenshots against resolved style/layout contracts (canvas track only).

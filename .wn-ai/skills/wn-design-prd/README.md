# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside a design-engineering project discovered via `design.project.json` — a "product + design first pass" that follows the target App's style & layout contracts (ids in `app.json`, files under the project's `styles/` and `layouts/`), then hands back any non-UI requirements it didn't implement.

## What it does

- Locates `<designRoot>` via `design.project.json` (no hardcoded install path).
- Interrogates the requirement, configures missing style (required) / layout (preferred) from **stock** packages, separates **non-UI requirements**.
- Implements Canvas drafts (framework-agnostic).
- Runs a mandatory visual **design review** against resolved contracts.
- Always returns untouched non-UI requirements; optionally emits a minimal handoff prompt.

## Two runners

- **detected** — a dev workflow (worktree / code-review / finish-branch) is installed: orchestrates step by step; **always isolates via worktree without asking** when `using-git-worktrees` is present.
- **plan** — nothing installed: IDE plan mode; skips branch/CR/finish; still runs design review.

## Prerequisites

- A `design.project.json` in the design-engineering project.
- Style contract file at `<stylesRoot>/<styleId>/design.md` (skill can recommend a stock id and write `app.json` after confirmation).
- For design review: `npm run dev` from `<designRoot>`; restart after adding Canvases.

## Bundled agent

- `agents/design-review.md` — visual gate from screenshots against resolved style/layout contracts.

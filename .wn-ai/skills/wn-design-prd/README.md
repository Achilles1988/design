# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside the `apps/design` engineering app — a "product + design first pass" that follows the target App's installed style & layout contracts, then hands back any non-UI requirements it didn't implement.

## What it does

- Interrogates the requirement, separating UI work from **non-UI requirements**.
- Implements Canvas drafts (framework-agnostic — matches the App's existing tech stack).
- Runs a mandatory visual **design review** against `docs/design/<app>` contracts.
- Always returns the untouched non-UI requirements; optionally emits a minimal handoff prompt for a downstream product repo.

## Two runners

- **detected** — a dev workflow (worktree / code-review / finish-branch) is installed: this skill orchestrates it step by step (never hands off), forcing `implement → code review → design review → finish`.
- **plan** — nothing installed: use the IDE's built-in plan mode (plan → approve → implement), skipping branch/CR/finish but still running design review.

## Prerequisites

- Target App has style/layout contracts under `docs/design/<app>/`. If missing, run `wn-design-spec` first.
- For design review, the design app dev server must be running (`cd apps/design && npm run dev`); newly added Canvases require a dev-server **restart** before preview.

## Bundled agent

- `agents/design-review.md` — visual gate that verifies each Canvas against its App's style & layout contracts from screenshots.

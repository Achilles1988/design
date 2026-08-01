# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside a design-engineering project discovered via `design.project.json` — a "product + design first pass" that follows the target App's style & layout contracts (ids in `app.json`, files under marker `stylesRoot` / `layoutsRoot`), then hands back any non-UI requirements it didn't implement.

**Canvas only.** This skill does not edit the engineering shell/framework. Host-UI work uses the **Shell Exit ramp** (ask to leave → hand off `stylesRoot` / `layoutsRoot` refs → invoke `brainstorming` if installed, otherwise tell the user to switch to plan mode).

## What it does

- Locates `<designRoot>` via `design.project.json` (no hardcoded install path).
- Interrogates one item at a time; configures missing style slots (`light` / `dark`, at least one required) / layout (preferred) from **stock** packages; separates **non-UI**.
- Writes a **requirement pack** to `docs/dev/superpowers/specs/YYYY-MM-DD-<appId>-<topic>-canvas-pack.md`, self-reviews, and **HARD-GATE**s on user approval before implement.
- Re-reads the pack before implement and before design-review (same-session drift control).
- Implements Canvas drafts (framework-agnostic: match existing Canvases).
- Mandatory visual **design review** against resolved contracts.
- Always returns non-UI (final state); **asks once** for a curated handoff prompt (default no).

## Two runners

- **detected** — worktree / code-review / finish-branch anchors present: orchestrates step by step; **always isolates via worktree without asking** when `using-git-worktrees` is present.
- **plan** — nothing installed: IDE plan mode after pack approval; skips branch/CR/finish; still runs design review.

## Prerequisites

- A `design.project.json` in the design-engineering project.
- Style contract at `<stylesRoot>/<styleId>/DESIGN.md` (or `design.md`) per configured slot (`app.json.style.light` / `app.json.style.dark`, at least one); skill can recommend a stock id per slot and write `app.json` after confirmation. Do not copy stock into a project-local mirror.
- For design review: `npm run dev` from `<designRoot>`; restart after adding Canvases.

## Bundled agent

- `agents/design-review.md` — visual gate from Canvas screenshots against resolved style/layout contracts.

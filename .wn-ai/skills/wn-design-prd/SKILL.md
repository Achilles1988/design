---
name: wn-design-prd
description: Use when turning a PRD or design requirement into real design-page (Canvas) UI inside a design-engineering app — creating, modifying, or deleting an App's Canvases that must follow that App's installed style and layout contracts.
---

# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside the `apps/design` engineering app, strictly following the target App's installed **style** and **layout** contracts. This skill is the "product + design first pass": it produces a design prototype, and always hands back any non-UI requirements it did not implement.

## Iron rules (non-negotiable)

1. **Orchestrator model.** This skill is ALWAYS the driver. When a dev workflow is installed, call its skills as sub-skills step by step — never hand the whole task off and never rely on a callback.
2. **Framework-agnostic.** You are given instructions, and YOU write the code. Implement by reading the target App's contracts + its EXISTING Canvas files and matching their tech stack. NEVER assume a framework. This file contains no framework-specific code on purpose.
3. **Requirement conservation.** A PRD often mixes UI and non-UI requirements. Implement only the UI part; separate the non-UI part and ALWAYS return it to the user (Step 9), even if nothing else consumes it.
4. **Design review is a mandatory gate** on BOTH runners (Step 7), judged from screenshots of the running preview.

## Vocabulary

- **App**: a design package under `apps/design/apps/<appId>/` (`app.json`, `canvases.json`, `canvases/*`).
- **Canvas**: one previewable page component (`canvases/<Component>.<ext>`, where `<ext>` follows the App's existing tech stack), listed in `canvases.json`.
- **Style contract**: `docs/design/<app>/rules/design.md`. **Layout contract**: `docs/design/<app>/layouts/<id>/LAYOUT.md`.
- **Runner**: `detected` (a dev workflow is installed) or `plan` (none installed).

## Step 0 — Detect & route

Probe `.wn-ai/skills/` for anchor skills and map them to steps:

| Step | Anchor skill | If missing |
| --- | --- | --- |
| #4 branch | `using-git-worktrees` | skip branching, work in current tree (note it) |
| #6 code review | `requesting-code-review` | skip CR (design review still runs) |
| #8 finish | `finishing-a-development-branch` | skip finish, tell user to finish manually |
| #5 implement (optional boost) | `executing-plans` / `subagent-driven-development` | none → this skill implements directly |

- Any of the branch/CR/finish anchors present → **detected**. None present → **plan**.
- If detection is ambiguous, ASK the user. The user may override the runner at any time.
- Do NOT hardcode a workflow's internal steps; only call its entry skill by name.

## Pipeline

| # | detected | plan |
| --- | --- | --- |
| 1 | detect & route (ask if unsure; user can override) | detect → no anchors → plan |
| 2 | interrogate design details **and separate non-UI requirements** | interrogate design details **and separate non-UI requirements** |
| 3 | assemble internal requirement pack (do NOT trigger the external workflow's brainstorming/requirement intake) | assemble as plan input |
| 4 | call `using-git-worktrees` (else degrade) | no branch |
| 5 | implement Canvas drafts (this skill implements; delegate to `executing-plans`/`subagent-driven-development` if installed and **tell it NOT to auto-finish and NOT to re-collect/clarify requirements** — the Step 3 pack is authoritative) | use the IDE's built-in **plan mode**: produce a plan → user approves → exit plan mode → implement |
| 6 | call `requesting-code-review` + fix (else skip) | skip |
| 7 | run `design-review` agent + fix | run `design-review` agent |
| 8 | call `finishing-a-development-branch` (else prompt manual) | skip |
| 9 | **non-UI requirement receipt (unconditional)** | **non-UI requirement receipt (unconditional)** |
| 10 | optional handoff prompt (if user wants) | optional handoff prompt (if user wants) |

**Ordering (detected):** implement → CR → **design review + fix** → finish. design review MUST land before finish. When delegating implementation, explicitly instruct the sub-skill "implement only; do not auto-finish/merge and do not re-collect or re-clarify requirements". Step 9 runs on BOTH runners regardless of Step 10.

## Step 2 — Interrogation checklist

Lock down, one item at a time:

- Target **App** (`docs/design/<app>/` exists and has `rules/design.md`).
- Which Canvases to **add / modify / delete** (list each).
- Which **layout** each Canvas follows (reference `docs/design/<app>/layouts/<id>/LAYOUT.md`).
- Fake-data rules for each Canvas (realistic placeholder content).
- **Separate non-UI requirements**: pull every requirement unrelated to UI/Canvas (backend logic, data/storage rules, business constraints, permissions, integrations…) and record them verbatim. This skill does NOT implement them; they are returned in Step 9. If unsure whether an item is UI, ask the user to classify it.

**Blocking conditions:**

- Missing style/layout contract for the App → **STOP** and tell the user to run `wn-design-spec` first. Do not invent contracts.
- No suitable layout exists for a Canvas → offer two paths: (a) user adds a new layout via `wn-design-spec`, or (b) mark the Canvas **"AI improvise the layout"** (design review then judges against style rules + general layout soundness only).

## Step 5 — Implement (framework-agnostic)

- **Read 1–3 existing Canvas files of the target App first** to learn its tech stack, imports, and conventions. Match them. Never introduce a different framework.
- Note: `app.json.style`/`app.json.layout` are App-level. A Canvas component does not declare style/layout; it just exports a component. Per-Canvas layout is a design intent — implement the component to match the chosen `LAYOUT.md`; do not change the data model.
- Mechanics (via the dev-only design-fs API / files):
  - **Add** a Canvas: call the design-fs add API to create it (placeholder file), then edit that file with the real design code.
  - **Modify** a Canvas: edit its Canvas file directly (no dedicated API).
  - **Delete** a Canvas: call the design-fs delete API (it removes the `canvases.json` entry and the file together — do not desync them by hand).
- **After ADDING any new Canvas file, the dev server must be restarted** before it can be previewed (the build-time file glob is static; a stale glob returns 404). Do this before Step 7.

## Step 7 — Design review

Delegate to the bundled `agents/design-review.md` on both runners. **Preview prerequisites (or review cannot capture screenshots):**

- The target design app's dev server is running (`cd apps/design && npm run dev`). In `detected` with a worktree, run it **inside that worktree**; in `plan`, the current tree.
- **If any new Canvas was added, the dev server has been restarted** (see Step 5).
- Resolve each reviewed Canvas's preview URL: `http://localhost:5173/apps/<appId>/canvases/<canvasId>`.
- If the server is unreachable or a URL can't be resolved, the review step must ERROR and explain how to start/restart the preview — never silently skip.

Fix every FAIL/PARTIAL, then re-review until PASS. Only then proceed to finish (detected).

## Step 9 — Non-UI requirement receipt (unconditional)

Always output, to the user, the non-UI requirements separated in Step 2 (verbatim, itemized), labeled: "The following non-UI requirements were NOT covered by this design prototype — hand them to downstream development." If the PRD had none, state explicitly "No uncovered non-UI requirements." This runs on both runners and is independent of Step 10.

## Step 10 — Optional handoff prompt

Ask whether to emit a minimal handoff prompt. If yes, output exactly:

```
Implement: <one-line requirement summary>
Key notes: <points locked in interrogation — target App, chosen layout, key interactions/data rules>
Design reference: <stable Canvas source paths, e.g. apps/design/apps/<app>/canvases/<id>.tsx; plus docs/design/<app>/rules|layouts contract paths>
Non-UI requirements (to implement): <the Step 2 items; "none" if empty>
```

Give **stable file paths, not `localhost` URLs** — this prompt is copied into a real product repo where dev URLs are meaningless. No bug lists; keep it minimal.

## Red flags — stop and fix

- Handing the whole task to an external workflow and hoping it calls back. (Use the orchestrator model.)
- design review running after merge, or being skipped. (It must precede finish.)
- Hardcoding React/Vue specifics instead of matching existing Canvases.
- Dropping non-UI requirements because "this skill doesn't implement them".
- Previewing a newly added Canvas without restarting the dev server.
- Inventing a style/layout contract instead of stopping for `wn-design-spec`.

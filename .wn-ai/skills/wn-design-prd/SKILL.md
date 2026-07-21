---
name: wn-design-prd
description: Use when turning a PRD or design requirement into real design-page (Canvas) UI inside a design-engineering app — creating, modifying, or deleting an App's Canvases that must follow that App's installed style and layout contracts.
---

# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside a **design-engineering project** (located via `design.project.json`), strictly following the target App's **style** and **layout** contracts resolved from that project. This skill is the "product + design first pass": it produces a design prototype, and always hands back any non-UI requirements it did not implement.

## Iron rules (non-negotiable)

1. **Orchestrator model.** This skill is ALWAYS the driver. When a dev workflow is installed, call its skills as sub-skills step by step — never hand the whole task off and never rely on a callback.
2. **Framework-agnostic.** You are given instructions, and YOU write the code. Implement by reading the target App's contracts + its EXISTING Canvas files and matching their tech stack. NEVER assume a framework. This file contains no framework-specific code on purpose.
3. **Requirement conservation.** A PRD often mixes UI and non-UI requirements. Implement only the UI part; separate the non-UI part and ALWAYS return it to the user (Step 9), even if nothing else consumes it.
4. **Design review is a mandatory gate** on BOTH runners (Step 7), judged from screenshots of the running preview.
5. **No hardcoded design-root path.** Never assume the design project lives at `apps/design`. Discover `<designRoot>` via `design.project.json` (see Step 0b).

## Vocabulary

- **Design root (`<designRoot>`):** directory containing `design.project.json`.
- **App**: a design package under `<designRoot>/<contentRoot>/<appId>/` (`app.json`, `canvases.json`, `canvases/*`).
- **Canvas**: one previewable page component (`canvases/<Component>.<ext>`, where `<ext>` follows the App's existing tech stack), listed in `canvases.json`.
- **Style contract**: `<designRoot>/<stylesRoot>/<styleId>/design.md` where `<styleId>` is `app.json.style`.
- **Layout contract**: `<designRoot>/<layoutsRoot>/<layoutId>/LAYOUT.md` (preferred; may be absent → AI improvise).
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

## Step 0b — Locate design project (blocking)

Before interrogation:

1. From the repository root, search for `design.project.json` (ignore `node_modules`).
2. **0 found** → STOP and tell the user a design-engineering project marker is required.
3. **>1 found** → ASK which `<designRoot>` to use.
4. **1 found** → that directory is `<designRoot>`. Read `contentRoot`, `stylesRoot`, `layoutsRoot`, `defaultAppId`.
5. All later paths (apps, contracts, `npm run dev`) are relative to this `<designRoot>`.

## Pipeline

| # | detected | plan |
| --- | --- | --- |
| 1 | detect & route (ask if unsure; user can override) | detect → no anchors → plan |
| 1b | locate design project (Step 0b) | locate design project (Step 0b) |
| 2 | interrogate + separate non-UI + **configure style/layout ids** | same |
| 3 | assemble internal requirement pack (do NOT trigger external brainstorming) | assemble as plan input |
| 4 | call `using-git-worktrees` with **declared preference: always isolate** (do not ask) | no branch |
| 5 | implement Canvas drafts (self or delegate; tell delegates NOT to auto-finish / re-clarify) | IDE plan mode → approve → implement |
| 6 | call `requesting-code-review` + fix (else skip) | skip |
| 7 | run `design-review` agent + fix | run `design-review` agent |
| 8 | call `finishing-a-development-branch` (else prompt manual) | skip |
| 9 | **non-UI requirement receipt (unconditional)** | same |
| 10 | optional handoff prompt | same |

**Ordering (detected):** implement → CR → **design review + fix** → finish. When calling `using-git-worktrees`, treat isolation as already consented for this skill — create/enter a worktree without asking.

## Step 2 — Interrogation & contract configuration

Lock down, one item at a time:

- Target **App** under `<contentRoot>/` (default suggestion: `defaultAppId` when sensible).
- Which Canvases to **add / modify / delete**.
- Which **layout id** each Canvas should follow as design intent (App-level `app.json.layout` is the default; per-canvas intent may differ for review only — do not invent new JSON fields).
- Fake-data rules.
- **Separate non-UI requirements** (verbatim); return in Step 9.

**Style (required):**

1. Read `app.json.style`. Valid iff `<stylesRoot>/<style>/design.md` exists.
2. If invalid/missing: list stock ids (subdirectories of `<stylesRoot>` that contain `design.md`). Recommend one. After user confirms, write `app.json.style` to that id.
3. If the stock list is empty → STOP (do not create contract files).

**Layout (preferred, not required):**

1. If `<layoutsRoot>/<id>/LAYOUT.md` exists for the chosen id → use it.
2. If missing/unsuitable: offer **"AI improvise the layout"** and/or recommend a better stock layout id; on confirm, write `app.json.layout`.
3. Recommendations may only use existing layout directory ids. Do not create layout packages.

**Never** mention or invoke legacy external design-spec skills. Never read design contracts outside `<designRoot>` `styles/` and `layouts/` trees.

## Step 5 — Implement (framework-agnostic)

- Read 1–3 existing Canvas files of the target App first; match their tech stack.
- `app.json.style` / `app.json.layout` are App-level ids. Canvas files export a component only.
- Add / modify / delete Canvases via design-fs (or equivalent files under `<contentRoot>`). Keep `canvases.json` in sync on delete.
- **After ADDING any new Canvas file, restart the design-project dev server** before Step 7.

## Step 7 — Design review

Delegate to `agents/design-review.md`. Prerequisites:

- Dev server running from `<designRoot>` (`npm run dev`). In a worktree, run it inside that worktree.
- Restarted after any new Canvas add.
- Preview URL pattern for this engineering app (commonly `http://localhost:5173/apps/<appId>/canvases/<canvasId>` — confirm from the project's router if unsure).
- Pass the resolved absolute-from-repo contract paths for style/layout to the reviewer.

If preview is unreachable → ERROR; never skip silently. Fix until PASS before finish (detected).

## Step 9 — Non-UI requirement receipt (unconditional)

Always output separated non-UI requirements (or explicitly "No uncovered non-UI requirements.").

## Step 10 — Optional handoff prompt

If yes, output exactly:

```
Implement: <one-line requirement summary>
Key notes: <points locked in interrogation — target App, chosen layout, key interactions/data rules>
Design reference: <stable Canvas source paths under <designRoot>/<contentRoot>/…; plus resolved styles/layouts contract paths>
Non-UI requirements (to implement): <the Step 2 items; "none" if empty>
```

Stable file paths only — no `localhost` URLs.

## Red flags — stop and fix

- Hardcoding a design-root path instead of using `design.project.json`.
- Handing the whole task to an external workflow and hoping it calls back.
- design review after merge, or skipped.
- Hardcoding framework specifics instead of matching existing Canvases.
- Dropping non-UI requirements.
- Previewing a newly added Canvas without restarting the dev server.
- Inventing style/layout contract files, or guiding the user to legacy spec skills or off-root design doc paths.

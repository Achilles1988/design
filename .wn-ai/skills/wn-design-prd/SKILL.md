---
name: wn-design-prd
description: Use when turning a PRD or design requirement into real design-page (Canvas) UI inside a design-engineering app — creating, modifying, or deleting an App's Canvases that must follow that App's installed style and layout contracts.
---

# wn-design-prd

## Summary

Purpose: Turn a PRD or design requirement into real, previewable Canvas page drafts inside a design-engineering project — following the target App's installed style and layout contracts, and always returning uncovered non-UI requirements.

Highlights:
- Previewable prototype: Ships real Canvas design drafts, not docs or sketches alone
- Contract-bound: Implements against the App's configured style and layout contracts
- Canvas-first: Default deliverable is Canvas; shell/framework edits are a rare maintainer-only path
- Dual-path orchestration: Detects an installed dev workflow (branch / CR / finish) or falls back to plan mode
- Always in charge: Drives the full pipeline; never hands the whole task off and waits for a callback
- Framework-agnostic: Matches the target App's existing Canvas tech stack — no assumed framework
- Design-review gate: Canvas track requires screenshot review of the running preview before finish
- Requirement conservation: UI only in scope; non-UI items always come back as an unconditional receipt

Usage:
```shell
/wn-design-prd
```

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside a **design-engineering project** (located via `design.project.json`), strictly following the target App's **style** and **layout** contracts. This skill is the "product + design first pass": it produces a design prototype, and always hands back any non-UI requirements it did not implement.

**Default deliverable is always Canvas.** Editing the engineering **shell / framework** is a rare, maintainer-only path (see Track fork) — not a normal alternative to offer end users.

## Iron rules (non-negotiable)

1. **Orchestrator model.** This skill is ALWAYS the driver. When a dev workflow is installed, call its skills as sub-skills step by step — never hand the whole task off and never rely on a callback.
2. **Canvas-first.** Prefer `canvas` track. Do **not** casually offer "edit the framework/shell" as an equal option. Shell is exceptional (below).
3. **Workflow continuity.** If track does become `shell`, that **never** cancels the detected runner. Keep branch / CR / finish whenever those anchors exist. Only Canvas-specific steps may be skipped or swapped.
4. **Framework-agnostic (Canvas track).** For Canvases: read the target App's contracts + EXISTING Canvas files and match their tech stack. NEVER assume a framework. This file contains no framework-specific Canvas code on purpose.
5. **Requirement conservation.** Implement only the UI part; separate non-UI and ALWAYS return it (Step 9).
6. **Design review is a mandatory gate on the Canvas track** (Step 7), judged from screenshots of the running Canvas preview. Shell track skips Step 7; still run CR + `verification-before-completion` when present.
7. **No hardcoded design-root path.** Discover `<designRoot>` via `design.project.json` (Step 0b).

## Vocabulary

- **Design root (`<designRoot>`):** directory containing `design.project.json`.
- **App**: package under `<designRoot>/<contentRoot>/<appId>/` (`app.json`, `canvases.json`, `canvases/*`).
- **Canvas**: previewable page under `canvases/`, listed in `canvases.json`.
- **Shell / framework**: engineering host UI that ships with the design-engineering app (Apps manager, Rule/Layout browsers, theme toggle, etc. — **not** App Canvases under `<contentRoot>/`). Maintainer surface, not a product design target for typical PRDs.
- **Track**: `canvas` (**default**) or `shell` (**exceptional**).
- **Style / Layout contract**: under `<stylesRoot>/<styleId>/design.md` and `<layoutsRoot>/<layoutId>/LAYOUT.md`.
- **Runner**: `detected` (dev workflow anchors present) or `plan` (none).

## Step 0 — Detect & route

Probe `.wn-ai/skills/` for anchor skills and map them to steps:

| Step | Anchor skill | If missing |
| --- | --- | --- |
| #4 branch | `using-git-worktrees` | skip branching, work in current tree (note it) |
| #6 code review | `requesting-code-review` | skip CR (Canvas design review still runs on canvas track) |
| #8 finish | `finishing-a-development-branch` | skip finish, tell user to finish manually |
| #5 implement (optional boost) | `executing-plans` / `subagent-driven-development` | none → this skill implements directly |

- Any of the branch/CR/finish anchors present → **detected**. None present → **plan**.
- If detection is ambiguous, ASK the user. The user may override the runner at any time.
- Do NOT hardcode a workflow's internal steps; only call its entry skill by name.
- **Override of track ≠ override of runner.** Choosing shell / "direct product UI" does not switch `detected` → ad-hoc coding.

## Step 0b — Locate design project (blocking)

Before interrogation:

1. From the repository root, search for `design.project.json` (ignore `node_modules`).
2. **0 found** → STOP and tell the user a design-engineering project marker is required.
3. **>1 found** → ASK which `<designRoot>` to use.
4. **1 found** → that directory is `<designRoot>`. Read `contentRoot`, `stylesRoot`, `layoutsRoot`, `defaultAppId`.
5. All later paths (apps, contracts, `npm run dev`) are relative to this `<designRoot>`.

## Track fork

**Default: `canvas`.** Assume Canvas drafts unless the user is clearly maintaining the design-engineering host itself.

### Shell is exceptional (do not offer lightly)

Editing shell/framework is a **special maintainer flow**, normally only done **in the design-engineering repository that owns that host** (the repo that contains both `design.project.json` and the shell sources). Typical product/design PRDs must stay on `canvas`.

**Enter `shell` only when all of these hold:**

1. The requirement explicitly targets host UI (Apps list, Rule/Layout asset browser, shell theme, sidebar, etc.) — not a product screen that merely *resembles* those pages.
2. The user (or maintainer) **explicitly** asks to change the real shell/framework — not after you volunteered it as option A/B.
3. You warned once that this edits the engineering host (not an App Canvas), and they confirmed.

**Do not:**

- Present "Canvas prototype vs edit framework" as a routine choice for ordinary PRDs.
- Steer designers/PMs toward framework edits "for speed" or "because the screenshot looks like the shell".
- Treat shell as the default when `/wn-design-prd` was invoked for a product UI.

If the user insists on shell after the warning: **announce `shell`**, stay the orchestrator, keep detected runner steps — do **not** "exit wn-design-prd". Mid-flight reclassification: same rules; re-announce track; never drop branch/CR/finish.

## Pipeline

| # | detected + canvas | detected + shell | plan |
| --- | --- | --- | --- |
| 1 | detect & route | same | detect → plan |
| 1b | locate design project | same | same |
| 2 | interrogate + contracts + non-UI | interrogate shell scope + non-UI (no Canvas contract setup) | same as track |
| 3 | requirement pack (no external brainstorming) | same | plan input |
| 4 | `using-git-worktrees` (**always isolate**, do not ask) | **same — still isolate** | no branch |
| 5 | implement Canvas drafts | implement shell UI under `<designRoot>` | plan → approve → implement |
| 6 | `requesting-code-review` + fix | **same** | skip |
| 7 | `design-review` agent + fix | **skip** (not a Canvas preview gate); verify in running shell instead | canvas: run design-review; shell: skip |
| 8 | `finishing-a-development-branch` | **same** | skip |
| 9 | non-UI receipt | same | same |
| 10 | optional handoff | same | same |

**Ordering (detected):** implement → CR → (canvas: design review + fix) → finish.

## Step 2 — Interrogation

**Canvas track** — lock down one item at a time:

- Target **App** (default suggestion: `defaultAppId` when sensible).
- Which Canvases to **add / modify / delete**.
- Which **layout id** each Canvas should follow as design intent (from `app.json.layouts`; review-only — do not invent JSON fields).
- Fake-data rules.
- **Separate non-UI requirements** (verbatim) → Step 9.

**Style (required, canvas):**

1. Read `app.json.style`. Valid iff `<stylesRoot>/<style>/design.md` exists.
2. If invalid/missing: list stock ids (dirs under `<stylesRoot>` with `design.md`). Recommend one. After confirm, write `app.json.style`.
3. Empty stock list → STOP (do not create contract files).

**Layout (preferred, canvas):**

1. If `<layoutsRoot>/<id>/LAYOUT.md` exists → use it.
2. Else offer **"AI improvise"** and/or a stock layout id; on confirm, append to `app.json.layouts` if missing.
3. Recommend only existing layout directory ids. Do not create layout packages.

**Shell track** — lock down:

- Which shell surfaces/routes to change.
- Acceptance checks (visual/interaction).
- **Separate non-UI** → Step 9.
- Do **not** force App style/layout contract configuration unless the change truly edits those contracts.

**Never** mention legacy external design-spec skills. Never read design contracts outside `<designRoot>` `styles/` and `layouts/` trees.

## Step 5 — Implement

**Canvas:** Read 1–3 existing Canvas files; match tech stack. Export a component only. Keep `canvases.json` in sync on delete. **After ADDING any new Canvas, restart** `npm run dev` from `<designRoot>` before Step 7.

**Shell:** Only after Track fork confirmation. Edit the engineering host under `<designRoot>` (follow repo coding/docs rules). Match existing shell patterns. Restart/reload as needed for verification. No Canvas `design-review` agent. Remind yourself this is maintainer work — keep the change scoped.

## Step 7 — Design review (canvas track only)

Delegate to `agents/design-review.md`. Prerequisites:

- Dev server from `<designRoot>` (`npm run dev`); in a worktree, run inside that worktree.
- Restarted after any new Canvas add.
- Preview URL (commonly `http://localhost:5173/apps/<appId>/canvases/<canvasId>` — confirm from router).
- Pass resolved absolute-from-repo style/layout contract paths.

If preview unreachable → ERROR; never skip silently. Fix until PASS before finish (detected).

## Step 9 — Non-UI requirement receipt (unconditional)

Always output separated non-UI requirements (or explicitly "No uncovered non-UI requirements.").

## Step 10 — Optional handoff prompt

If yes, output exactly:

```
Implement: <one-line requirement summary>
Key notes: <points locked in interrogation — track, target App or shell surfaces, layout/interactions/data rules>
Design reference: <stable paths under <designRoot>/…; plus style/layout contracts when canvas track>
Non-UI requirements (to implement): <the Step 2 items; "none" if empty>
```

Stable file paths only — no `localhost` URLs.

## Rationalizations (not allowed)

| Excuse | Reality |
| --- | --- |
| "Offer shell vs Canvas so the user can pick" | Shell is exceptional; default Canvas. Only ask after explicit host-UI intent + warning. |
| "Screenshot looks like Apps/Layout pages → edit framework" | That is still usually a Canvas job unless they maintain the host. |
| "User chose shell, so exit wn-design-prd" | Track changed; skill still drives. Announce track and continue. |
| "Not Canvas, so skip worktree / CR / finish" | Runner steps, not Canvas-only. Shell keeps them when `detected`. |
| "design-review doesn't apply, so the whole gate stack is optional" | Only Step 7 is Canvas-specific. CR + finish remain. |
| "Shell polish is too small for isolation" | detected + `using-git-worktrees` → always isolate; do not ask. |
| "Override runner" when user only overrode the deliverable | Track ≠ runner. |

## Red flags — stop and fix

- Casually offering framework/shell edits to a normal PRD / design user.
- Dropping worktree / CR / finish because the track became `shell`.
- Saying the skill "no longer applies" after a track choice without user explicitly canceling the skill.
- Hardcoding a design-root path instead of `design.project.json`.
- Handing the whole task to an external workflow and hoping it calls back.
- Canvas design review after merge, or skipped on **canvas** track.
- Hardcoding Canvas framework specifics instead of matching existing Canvases.
- Dropping non-UI requirements.
- Previewing a newly added Canvas without restarting the dev server.
- Inventing style/layout contract files, or guiding the user to legacy spec skills / off-root design doc paths.

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
- Canvas-only: Default and only implementation track is Canvas; shell/framework edits use the Exit ramp (leave this skill)
- Dual-path orchestration: Detects an installed dev workflow (branch / CR / finish) or falls back to plan mode
- Always in charge: Drives the full Canvas pipeline; never hands the whole task off and waits for a callback
- Framework-agnostic: Matches the target App's existing Canvas tech stack — no assumed framework
- Controllability gate: Disk-backed requirement pack + user approval before any Canvas implementation
- Design-review gate: Screenshot review of the running preview before finish
- Requirement conservation: UI only in scope; non-UI items always come back; optional curated handoff ask after receipt

Usage:
```shell
/wn-design-prd
```

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside a **design-engineering project** (located via `design.project.json`), strictly following the target App's **style** and **layout** contracts. This skill is the "product + design first pass": it produces a design prototype, and always hands back any non-UI requirements it did not implement.

**This skill implements Canvas only.** Editing the engineering **shell / framework** is out of scope — use **Shell Exit ramp** (below). Do not offer shell edits as a routine alternative.

## Iron rules (non-negotiable)

1. **Orchestrator model.** This skill is ALWAYS the driver for the Canvas pipeline. When a dev workflow is installed, call its skills as sub-skills step by step — never hand the whole Canvas task off and never rely on a callback.
2. **Canvas-only implementation.** Never edit shell/framework sources inside this skill. Host-UI work → Exit ramp.
3. **HARD-GATE.** Do not implement Canvas code, and do not start worktree implementation, until the requirement pack is written, self-reviewed, and the user explicitly approves it. Tiny requests still need a short pack + approval.
4. **No external brainstorming for Canvas.** Interrogation + pack replace brainstorming for Canvas work. Do not invoke `brainstorming` unless taking the Shell Exit ramp.
5. **Framework-agnostic (Canvas).** Read the target App's contracts + EXISTING Canvas files and match their tech stack. NEVER assume a framework. This file contains no framework-specific Canvas code on purpose.
6. **Requirement conservation.** Implement only the UI part; separate non-UI and ALWAYS return it (Step 9). Optional Step 10 curated handoff uses the **final** discussion state.
7. **Design review is a mandatory gate** (Step 7), judged from screenshots of the running Canvas preview.
8. **No hardcoded design-root path.** Discover `<designRoot>` via `design.project.json` (Step 0b).
9. **Re-read the pack.** Before Step 5 and before Step 7, Read the approved pack file from disk. TodoWrite tracks pipeline steps only — it does not replace the pack.
10. **Worktree pack handoff.** When Step 4 isolates into a worktree, that worktree does not see this tree's uncommitted/untracked files. Copy (or rewrite) the approved pack into the worktree at the same relative path, and copy or re-apply any interrogation-time `app.json` style/layout edits there — before Step 5. Read and implement only inside that worktree for the rest of the pipeline.

## Vocabulary

- **Design root (`<designRoot>`):** directory containing `design.project.json`.
- **App**: package under `<designRoot>/<contentRoot>/<appId>/` (`app.json`, `canvases.json`, `canvases/*`).
- **Canvas**: previewable page under `canvases/`, listed in `canvases.json`.
- **Shell / framework**: engineering host UI that ships with the design-engineering app (Apps manager, Rule/Layout browsers, theme toggle, etc. — **not** App Canvases under `<contentRoot>/`). Out of implementation scope for this skill.
- **Style / Layout contract**: under `<stylesRoot>/<styleId>/DESIGN.md` (or `design.md`) and `<layoutsRoot>/<layoutId>/LAYOUT.md` — stock paths from `design.project.json`, read-only.
- **Runner**: `detected` (dev workflow anchors present) or `plan` (none).
- **Requirement pack**: disk file under `docs/dev/superpowers/specs/YYYY-MM-DD-<appId>-<topic>-canvas-pack.md` — same-session anchor and approval artifact.

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

## Step 0c — Shell check (Exit ramp)

If the requirement **explicitly** targets host/engineering UI (Apps list, Rule/Layout asset browser, shell theme, sidebar chrome, etc.) or the user explicitly asks to change the framework — and this is **not** merely a product screen that resembles those pages:

1. State clearly: this skill does **not** edit shell/framework.
2. Ask whether to leave for a normal development flow.
3. **If no:** continue with Canvas-only work for any remaining Canvas scope, or stop. Never edit shell here.
4. **If yes:** emit a **shell handoff** in the reply covering:
   - Shell surfaces / acceptance intent (concise, final intent)
   - Design refs resolved from `design.project.json` `stylesRoot` / `layoutsRoot` (recommend shell-relevant stock when those packages exist, e.g. a dashboard-style DESIGN.md and `sidebar-shell` LAYOUT.md when present)
   - If no usable style/layout contract files exist: **explicitly say there is currently no shell style/layout contract**
   - Any non-UI already separated
5. If `brainstorming` is installed under `.wn-ai/skills/` (or equivalent) → **invoke brainstorming** with that handoff as entry context.
6. If brainstorming is **not** installed → advise the user to **switch to plan mode themselves** and keep/use the same handoff. Do not pretend this skill entered plan mode.
7. After handoff (+ brainstorming invoke when applicable), this skill's responsibility for the **shell** work ends.

Do **not** present "Canvas vs edit framework" as a routine choice for ordinary product PRDs.

## Pipeline

| # | detected | plan |
| --- | --- | --- |
| 0 | detect & route | detect → plan |
| 0b | locate design project | same |
| 0c | shell check → Exit ramp if host UI | same |
| 2 | interrogate + contracts + non-UI | same |
| 3 | section confirms → write pack → self-review → **user approve (HARD-GATE)** | same (pack = plan input) |
| 4 | `using-git-worktrees` (**always isolate**, do not ask) → copy pack + `app.json` edits into worktree | no branch |
| 5 | **Read pack** → implement Canvas drafts | plan → approve → **Read pack** → implement |
| 6 | `requesting-code-review` + fix | skip |
| 7 | **Read pack** → `design-review` + fix | same |
| 8 | `finishing-a-development-branch` | skip |
| 9 | non-UI receipt (final state) | same |
| 10 | **Ask once** for curated handoff (default no) | same |

**Ordering (detected):** approve pack → implement → CR → design review + fix → finish → receipt → optional handoff ask.

## Step 2 — Interrogation

Lock down **one item at a time**:

- Target **App** (default suggestion: `defaultAppId` when sensible).
- Which Canvases to **add / modify / delete**.
- Which **layout id** each Canvas should follow as design intent (from `app.json.layouts` when present; review-only — do not invent JSON fields).
- Fake-data rules.
- **Separate non-UI requirements** (verbatim at this stage) → refined again at Step 9 / 10.

**Style (required):**

1. Read `app.json.style`. Valid iff `<stylesRoot>/<style>/DESIGN.md` or `design.md` exists.
2. If invalid/missing: list stock ids (dirs under `<stylesRoot>` with `DESIGN.md` / `design.md`). Recommend one. After confirm, write `app.json.style`.
3. Empty stock list → STOP (do not create contract files). Do not copy stock packages into a project-local tree.

**Layout (preferred):**

1. If `<layoutsRoot>/<id>/LAYOUT.md` exists → use it.
2. Else offer **"AI improvise"** and/or a stock layout id; on confirm, append to `app.json.layouts` if missing.
3. Recommend only existing layout directory ids. Do not create or copy layout packages.
4. **AI improvise convention:** record the layout as `AI improvise` with path `n/a` (or equivalent) in the pack (Step 3) — no `LAYOUT.md` is required for this case.

**Approaches:** Only when there is a real fork (how to split Canvases, stock layout vs AI improvise, etc.), propose 2–3 options with a recommendation. Do not force approaches every run.

**Never** invent local style/layout mirrors; resolve contracts only under `<stylesRoot>` / `<layoutsRoot>` from the marker.

## Step 3 — Requirement pack (HARD-GATE)

### Section confirms (before writing the file)

1. **Scope** — App + Canvas add/modify/delete + non-UI initial split. Ask if it looks right.
2. **Contracts** — style / layout / fake-data. Ask if it looks right.
3. **Page intent** — per Canvas, 3–8 structure bullets + acceptance checks. Ask if it looks right.

Then write the pack file and run self-review before whole-pack approval.

### Pack path

`docs/dev/superpowers/specs/YYYY-MM-DD-<appId>-<topic>-canvas-pack.md`

Purpose: same-session anchor so execution does not drift. Not primarily cross-conversation continuity. Do **not** require committing the pack.

### Required fields

- track: `canvas`
- App id
- Canvas list (add / modify / delete)
- style id + resolved repo-relative contract path
- layout id(s) + resolved contract path(s) (`AI improvise` / `n/a` when no layout file is used)
- Page intent per Canvas (3–8 bullets)
- Fake-data rules
- Explicitly out of UI scope
- Non-UI initial split
- Acceptance checks (preview path shape + visual/interaction bullets)

### Self-review (before asking approval)

1. No TBD / TODO / vague placeholders
2. Canvas list internally consistent
3. style file exists on disk (mandatory)
4. layout file exists on disk — unless layout is `AI improvise` (path `n/a`; skip this check only for that case)
5. UI vs non-UI not mixed
6. Scope fits one delivery batch (else decompose first)

### Approval

Ask the user to review the pack file and approve before implementation. Until explicit approval:

- Do not implement Canvas code
- Do not start implement inside a worktree
- Interrogation-time `app.json` style/layout writes after user confirm remain allowed

If the pack changes after approval: edit file → self-review → re-approve.

## Step 4 — Worktree isolation (pack handoff)

When `using-git-worktrees` creates the isolated worktree, it does **not** see this tree's uncommitted/untracked files — the approved pack and any interrogation-time `app.json` edits are invisible there until copied.

Before Step 5, inside the isolation flow:

1. Copy (or rewrite) the approved pack file into the worktree at the **same relative path** (`docs/dev/superpowers/specs/...-canvas-pack.md`).
2. Ensure interrogation-time `app.json` style/layout edits are present in the worktree copy — copy the file or re-apply the same edits.
3. From here on, **Read and implement only inside that worktree** (Step 5 pack re-read, Step 7 dev server, etc.) for the remainder of the pipeline.

If no worktree isolation was used (anchor missing, or `plan` runner), skip this step — everything already lives in the current tree.

## Step 5 — Implement

**Always Read the approved pack first** (from inside the worktree, per Step 4, when isolation was used).

Read 1–3 existing Canvas files; match tech stack. Export a component only. Keep `canvases.json` in sync on delete. **After ADDING any new Canvas, restart** `npm run dev` from `<designRoot>` before Step 7.

## Step 7 — Design review

**Always Read the approved pack first.**

Delegate to `agents/design-review.md`. Prerequisites:

- Dev server from `<designRoot>` (`npm run dev`); in a worktree, run inside that worktree.
- Restarted after any new Canvas add.
- Preview URL (commonly `http://localhost:5173/apps/<appId>/canvases/<canvasId>` — confirm from router).
- Pass resolved absolute-from-repo style/layout contract paths.

If preview unreachable → ERROR; never skip silently. Fix until PASS before finish (detected).

## Step 9 — Non-UI requirement receipt (unconditional)

Always output separated non-UI requirements reflecting the **final** discussion state (or explicitly "No uncovered non-UI requirements."). If early Step 2 split drifted, rewrite here — do not paste stale text.

## Step 10 — Curated handoff ask

After Step 9, **always ask once** (default no):

> Generate a curated handoff prompt for follow-on implementation? Default is no.

If yes, output exactly:

```
Implement: <one-line requirement summary>
UI (done / reference): 参考 <stable paths under designRoot/…>; style/layout contracts <paths>
Key notes: <final locked notes — App, layouts, interactions, fake-data>
Non-UI (to implement): <rewritten, concise, precise final non-UI list | none>
```

Stable file paths only — no `localhost` URLs. UI points at delivered design artifacts; Non-UI is re-integrated from the final discussion.

## Rationalizations (not allowed)

| Excuse | Reality |
| --- | --- |
| "Offer shell vs Canvas so the user can pick" | Shell is Exit ramp only; never a routine A/B for product PRDs. |
| "Screenshot looks like Apps/Layout pages → edit framework" | Still Canvas unless they explicitly maintain the host — then Exit ramp. |
| "User wants shell, so implement shell here" | Exit ramp only. Never edit shell in this skill. |
| "Too small for a pack / approval" | HARD-GATE always; pack may be short. |
| "I already know the pack, skip re-read" | Read pack before Step 5 and Step 7. |
| "Handoff is optional so skip asking" | Always ask once after Step 9; default no. |
| "Invoke brainstorming for Canvas clarifying" | No — interrogation + pack only. Brainstorming is for Exit ramp. |
| "No shell contracts, invent some" | Say there is no shell style/layout contract; do not invent files. |

## Red flags — stop and fix

- Implementing shell/framework inside this skill.
- Missing pack file, self-review, or user approval before Canvas implement.
- Skipping pack re-read before implement or design-review.
- Step 10 with no ask (`If yes` without a question).
- Hardcoding a design-root path instead of `design.project.json`.
- Handing the whole Canvas task to an external workflow and hoping it calls back.
- Canvas design review after merge, or skipped.
- Hardcoding Canvas framework specifics instead of matching existing Canvases.
- Dropping or stale-pasting non-UI requirements.
- Previewing a newly added Canvas without restarting the dev server.
- Inventing style/layout contract files.

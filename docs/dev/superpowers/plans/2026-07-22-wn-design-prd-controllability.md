# wn-design-prd Controllability Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `.wn-ai/skills/wn-design-prd` so the skill is canvas-only, requires a disk-backed requirement pack + HARD-GATE before implement, asks once for a curated handoff, and routes shell work out via an Exit ramp.

**Architecture:** Documentation-only change to the skill instruction surface. No app runtime code. Foundations (detect runner, `design.project.json`, framework-agnostic Canvas implement, design-review agent) stay; shell track is removed; brainstorming-style controllability gates are inlined without calling external brainstorming for Canvas work.

**Tech Stack:** Markdown skill docs under `.wn-ai/skills/wn-design-prd/`; verification via ripgrep checklists against the approved spec.

**Spec:** `docs/dev/superpowers/specs/2026-07-22-wn-design-prd-controllability-design.md`

## Global Constraints

- Skill body language: **English** (match existing `SKILL.md` / `design-review.md`).
- Plan / commit messages may be English or match recent repo style.
- Do **not** edit `agents/design-review.md` unless adding a single optional cross-ref; default is leave it unchanged.
- Do **not** invent `.cursor/skills` or `.claude/skills` mirrors — this repo only has `.wn-ai/skills/wn-design-prd/`.
- skill text must remain **framework-agnostic** for Canvas implementation (no React/Vue code samples).
- Do **not** call external brainstorming for normal Canvas interrogation.
- Pack path must be exactly: `docs/dev/superpowers/specs/YYYY-MM-DD-<appId>-<topic>-canvas-pack.md`
- No auto-commit of canvas-pack files required by the skill.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `.wn-ai/skills/wn-design-prd/SKILL.md` | Full orchestrator instructions (rewrite) |
| `.wn-ai/skills/wn-design-prd/README.md` | Short user-facing summary (rewrite) |
| `.wn-ai/skills/wn-design-prd/agents/design-review.md` | Unchanged |
| `docs/dev/superpowers/specs/2026-07-21-wn-design-prd-design.md` | Add supersession banner pointing at 2026-07-22 spec |

---

### Task 1: Rewrite `SKILL.md` (canvas-only + gates)

**Files:**
- Modify: `.wn-ai/skills/wn-design-prd/SKILL.md` (full replace)
- Test: verification greps in Task 3

**Interfaces:**
- Consumes: approved decisions in `2026-07-22-wn-design-prd-controllability-design.md`
- Produces: skill steps 0 / 0b / 0c / 2 / 3 / 4–10 as specified below

- [ ] **Step 1: Replace `.wn-ai/skills/wn-design-prd/SKILL.md` with the following full contents**

```markdown
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
| 4 | `using-git-worktrees` (**always isolate**, do not ask) | no branch |
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
- layout id(s) + resolved contract path(s)
- Page intent per Canvas (3–8 bullets)
- Fake-data rules
- Explicitly out of UI scope
- Non-UI initial split
- Acceptance checks (preview path shape + visual/interaction bullets)

### Self-review (before asking approval)

1. No TBD / TODO / vague placeholders
2. Canvas list internally consistent
3. style/layout files exist on disk
4. UI vs non-UI not mixed
5. Scope fits one delivery batch (else decompose first)

### Approval

Ask the user to review the pack file and approve before implementation. Until explicit approval:

- Do not implement Canvas code
- Do not start implement inside a worktree
- Interrogation-time `app.json` style/layout writes after user confirm remain allowed

If the pack changes after approval: edit file → self-review → re-approve.

## Step 5 — Implement

**Always Read the approved pack first.**

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
```

- [ ] **Step 2: Confirm the file is non-empty and frontmatter `name: wn-design-prd` is present**

Run:

```bash
head -n 5 .wn-ai/skills/wn-design-prd/SKILL.md
wc -l .wn-ai/skills/wn-design-prd/SKILL.md
```

Expected: YAML frontmatter with `name: wn-design-prd`; line count roughly 200+ (not a stub).

- [ ] **Step 3: Commit**

```bash
git add .wn-ai/skills/wn-design-prd/SKILL.md
git commit -m "$(cat <<'EOF'
docs(skill): canvas-only wn-design-prd with pack HARD-GATE

Rewrite SKILL.md for requirement-pack approval, curated handoff ask, and shell Exit ramp.
EOF
)"
```

---

### Task 2: Rewrite `README.md`

**Files:**
- Modify: `.wn-ai/skills/wn-design-prd/README.md` (full replace)

**Interfaces:**
- Consumes: Task 1 vocabulary (canvas-only, pack, Exit ramp, curated handoff)
- Produces: short user-facing summary consistent with SKILL.md

- [ ] **Step 1: Replace `.wn-ai/skills/wn-design-prd/README.md` with:**

```markdown
# wn-design-prd

Turn a PRD / design requirement into **real, previewable Canvas design drafts** inside a design-engineering project discovered via `design.project.json` — a "product + design first pass" that follows the target App's style & layout contracts (ids in `app.json`, files under marker `stylesRoot` / `layoutsRoot`), then hands back any non-UI requirements it didn't implement.

**Canvas only.** This skill does not edit the engineering shell/framework. Host-UI work uses the **Shell Exit ramp** (ask to leave → hand off `stylesRoot` / `layoutsRoot` refs → invoke `brainstorming` if installed, otherwise tell the user to switch to plan mode).

## What it does

- Locates `<designRoot>` via `design.project.json` (no hardcoded install path).
- Interrogates one item at a time; configures missing style (required) / layout (preferred) from **stock** packages; separates **non-UI**.
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
- Style contract at `<stylesRoot>/<styleId>/DESIGN.md` (or `design.md`); skill can recommend a stock id and write `app.json` after confirmation. Do not copy stock into a project-local mirror.
- For design review: `npm run dev` from `<designRoot>`; restart after adding Canvases.

## Bundled agent

- `agents/design-review.md` — visual gate from Canvas screenshots against resolved style/layout contracts.
```

- [ ] **Step 2: Commit**

```bash
git add .wn-ai/skills/wn-design-prd/README.md
git commit -m "$(cat <<'EOF'
docs(skill): refresh wn-design-prd README for canvas-only flow
EOF
)"
```

---

### Task 3: Supersession banner on prior design spec

**Files:**
- Modify: `docs/dev/superpowers/specs/2026-07-21-wn-design-prd-design.md` (top banner only)

**Interfaces:**
- Consumes: path of `2026-07-22-wn-design-prd-controllability-design.md`
- Produces: readers redirected for shell/handoff/pack rules

- [ ] **Step 1: Insert this banner immediately after the H1 (before or replacing the existing contract-path note as a second note):**

```markdown
> **Controllability update (2026-07-22):** Shell track parity, handoff trigger, and pre-implement approval are superseded by `docs/dev/superpowers/specs/2026-07-22-wn-design-prd-controllability-design.md`. Treat that document as authoritative for canvas-only flow, requirement pack HARD-GATE, curated handoff ask, and Shell Exit ramp.
```

Keep the existing contract-path update note; do not delete historical content wholesale.

- [ ] **Step 2: Commit**

```bash
git add docs/dev/superpowers/specs/2026-07-21-wn-design-prd-design.md
git commit -m "$(cat <<'EOF'
docs: point wn-design-prd design at controllability supersession
EOF
)"
```

---

### Task 4: Verification greps (acceptance)

**Files:**
- Test only: `.wn-ai/skills/wn-design-prd/SKILL.md`, `README.md`

**Interfaces:**
- Consumes: Task 1–2 outputs
- Produces: pass/fail against spec anti-patterns

- [ ] **Step 1: Forbidden shell-track language must be absent**

Run:

```bash
rg -n "detected \+ shell|Track\`: \`shell\`|detected \+ shell|shell track" .wn-ai/skills/wn-design-prd/SKILL.md .wn-ai/skills/wn-design-prd/README.md || true
rg -n "If yes, output exactly" .wn-ai/skills/wn-design-prd/SKILL.md || true
```

Expected: no matches for a pipeline column / track named shell; no bare `If yes, output exactly` without a preceding ask instruction. (The curated handoff template may still say "If yes" **after** an explicit ask — that is OK if "always ask once" appears above it.)

- [ ] **Step 2: Required phrases must be present**

Run:

```bash
rg -n "HARD-GATE|canvas-pack\.md|Exit ramp|always ask once|Read the approved pack|brainstorming" .wn-ai/skills/wn-design-prd/SKILL.md
rg -n "Canvas only|Exit ramp|HARD-GATE|canvas-pack" .wn-ai/skills/wn-design-prd/README.md
```

Expected: each concept appears at least once in SKILL; README covers Canvas only, Exit ramp, HARD-GATE, pack path concept.

- [ ] **Step 3: Manual checklist against spec**

Walk `2026-07-22-wn-design-prd-controllability-design.md` Decisions table rows and tick:

- [ ] Pack path exact
- [ ] HARD-GATE before implement/worktree implement
- [ ] Three section confirms
- [ ] Re-read before Step 5 and 7
- [ ] Handoff ask + curated template fields
- [ ] Exit ramp: ask → handoff with stylesRoot/layoutsRoot or “no shell contract” → brainstorming else suggest plan mode
- [ ] No shell implementation path in pipeline table

- [ ] **Step 4: Final commit only if Step 1–3 caused fixes; otherwise done**

If greps failed and you edited files:

```bash
git add .wn-ai/skills/wn-design-prd/SKILL.md .wn-ai/skills/wn-design-prd/README.md
git commit -m "$(cat <<'EOF'
docs(skill): fix wn-design-prd verification gaps
EOF
)"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Canvas-only rewrite / remove shell track column | Task 1 |
| Pack path + fields + self-review + HARD-GATE | Task 1 Step 3 section |
| Section confirms | Task 1 |
| Re-read before 5/7 | Task 1 |
| Curated handoff ask | Task 1 Step 10 |
| Shell Exit ramp + brainstorming / suggest plan | Task 1 Step 0c |
| stylesRoot/layoutsRoot or “no contract” | Task 1 Step 0c |
| README update | Task 2 |
| Sync .cursor/.claude mirrors | N/A — mirrors absent; noted in Global Constraints |
| design-review.md unchanged | Global Constraints + File Structure |
| Supersession pointer | Task 3 |
| Verification | Task 4 |

Placeholder scan: none intentional. Type/name consistency: pack filename pattern identical in SKILL, README, and spec.

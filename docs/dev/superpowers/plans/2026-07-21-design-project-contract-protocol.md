# Design Project Contract Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move authoritative style/layout contracts into the design engineering tree behind `design.project.json`, delete `docs/design/` and all `wn-design-spec` guidance, and harden `wn-design-prd` to discover roots, recommend stock ids, and always isolate worktrees.

**Architecture:** A marker file at `<designRoot>/design.project.json` is the only discovery entry. Shared contracts live under `<stylesRoot>/<styleId>/design.md` and `<layoutsRoot>/<layoutId>/LAYOUT.md`. Apps (including default app `design`) only store style/layout ids in `app.json`. `wn-design-prd` and `design-review` resolve paths from the marker; Assets under `framework/public/assets/` remain a browser library, not the App contract source of truth.

**Tech Stack:** filesystem layout + Markdown skill docs; Vite design app already present; no new runtime dependency required for discovery (agents/scripts read JSON).

**Spec:** `docs/dev/superpowers/specs/2026-07-21-design-project-contract-protocol-design.md`

## Global Constraints

- Do not invent style/layout contract files; recommend only stock directory ids under `styles/` and `layouts/`.
- Do not hardcode `apps/design` as the only design root in skill/agent/handoff text — always resolve via `design.project.json`.
- Delete the entire `docs/design/` tree after migration; do not leave a stub.
- Abolish `wn-design-spec` references (skill does not exist; remove guidance only).
- Install/sync scripts are out of scope.
- Do not change Canvas data model (no per-canvas layout field).
- Do not restyle shell tokens; migrate contract files and references only.
- Public API/config surface changes must include `docs/dev/api/` notes in the same change.
- Skill / agent / README bodies stay in English; this plan’s narration may be Chinese.
- Follow `docs/dev/conventions/coding-standards.md` for any code touched.

---

## File map

| Path | Responsibility |
|------|----------------|
| Create: `apps/design/design.project.json` | Design-root marker + roots config |
| Create: `apps/design/styles/dashboard/*` | Authoritative style contract (migrated) |
| Create: `apps/design/layouts/sidebar-shell/*`, `…/split-screen/*` | Authoritative layout contracts (migrated) |
| Delete: `docs/design/**` | Remove obsolete host-repo contract tree |
| Create: `docs/dev/api/design-project.md` | Public protocol: discovery + resolve formulas |
| Modify: `docs/dev/api/design-fs.md` | Point App contracts to styles/layouts; assets stay library |
| Modify: `apps/design/README.md` | Point to marker + styles/layouts |
| Modify: `.wn-ai/skills/wn-design-prd/SKILL.md` | Discovery, recommend, worktree default, no docs/design |
| Modify: `.wn-ai/skills/wn-design-prd/README.md` | Same |
| Modify: `.wn-ai/skills/wn-design-prd/agents/design-review.md` | Resolve contracts from marker |
| Modify: `.wn-ai/memories/memory.md` | Design Spec section → protocol |
| Modify: `AGENTS.md`, `CLAUDE.md`, `CODEBUDDY.md`, `GEMINI.md` | Keep in sync with memory Design Spec / overview |
| Modify: old specs/plans listed in Task 4 | Supersede / rewrite obsolete `docs/design` / `wn-design-spec` lines |

Unchanged (intentional): `framework/public/assets/designmd|layoutmd` browser library; `apps/design/apps/design/app.json` ids (`dashboard` / `sidebar-shell`) already match target shared-library ids.

---

### Task 1: Marker + public API doc

**Files:**
- Create: `apps/design/design.project.json`
- Create: `docs/dev/api/design-project.md`
- Modify: `docs/dev/api/design-fs.md` (provenance paragraph only in this task if migration not yet done — prefer finishing provenance in Task 2; this task at least adds a “see also” link)

**Interfaces:**
- Produces: marker schema `schemaVersion`, `contentRoot`, `stylesRoot`, `layoutsRoot`, `defaultAppId`
- Consumes: nothing

- [ ] **Step 1: Write `apps/design/design.project.json`**

```json
{
  "schemaVersion": 1,
  "contentRoot": "apps",
  "stylesRoot": "styles",
  "layoutsRoot": "layouts",
  "defaultAppId": "design"
}
```

- [ ] **Step 2: Write `docs/dev/api/design-project.md`** with at least:

  - Purpose: locate `<designRoot>` and resolve App style/layout contracts
  - Discovery: from repo root, search for files named `design.project.json`; 0 → error; 1 → use; >1 → ask user
  - Field table matching the JSON above
  - Resolve formulas:
    - App dir: `<designRoot>/<contentRoot>/<appId>/`
    - Style: `<designRoot>/<stylesRoot>/<app.json.style>/design.md` (required)
    - Layout: `<designRoot>/<layoutsRoot>/<layoutId>/LAYOUT.md` (preferred; optional)
  - Explicit: `framework/public/assets/` is not the App contract source of truth
  - Explicit: `docs/design/` is retired

- [ ] **Step 3: Verify marker is discoverable**

```bash
find . -name design.project.json -not -path './node_modules/*' -not -path './apps/design/node_modules/*'
```

Expected: exactly one path `./apps/design/design.project.json` (or `apps/design/design.project.json`).

- [ ] **Step 4: Commit**

```bash
git add apps/design/design.project.json docs/dev/api/design-project.md
git commit -m "$(cat <<'EOF'
docs(api): add design.project.json marker and protocol notes

EOF
)"
```

---

### Task 2: Migrate contracts and delete `docs/design/`

**Files:**
- Create: `apps/design/styles/dashboard/design.md`, `components.html` (copy from `docs/design/design/rules/`)
- Create: `apps/design/layouts/sidebar-shell/LAYOUT.md`, `preview.html`
- Create: `apps/design/layouts/split-screen/LAYOUT.md`, `preview.html`
- Delete: entire `docs/design/` tree
- Modify: `apps/design/README.md`
- Modify: `docs/dev/api/design-fs.md` (Assets provenance → styles/layouts)

**Interfaces:**
- Consumes: Task 1 marker (`stylesRoot=styles`, `layoutsRoot=layouts`)
- Produces: on-disk contracts resolvable by formulas in `docs/dev/api/design-project.md`

- [ ] **Step 1: Create directories and copy files**

```bash
mkdir -p apps/design/styles/dashboard \
  apps/design/layouts/sidebar-shell \
  apps/design/layouts/split-screen

cp docs/design/design/rules/design.md apps/design/styles/dashboard/design.md
cp docs/design/design/rules/components.html apps/design/styles/dashboard/components.html

cp docs/design/design/layouts/sidebar-shell/LAYOUT.md apps/design/layouts/sidebar-shell/LAYOUT.md
cp docs/design/design/layouts/sidebar-shell/preview.html apps/design/layouts/sidebar-shell/preview.html

cp docs/design/design/layouts/split-screen/LAYOUT.md apps/design/layouts/split-screen/LAYOUT.md
cp docs/design/design/layouts/split-screen/preview.html apps/design/layouts/split-screen/preview.html
```

Do **not** rename `design.md` to `DESIGN.md`. Spec requires `design.md`.

- [ ] **Step 2: Verify resolve formulas against default App**

```bash
test -f apps/design/styles/dashboard/design.md
test -f apps/design/layouts/sidebar-shell/LAYOUT.md
test -f apps/design/layouts/split-screen/LAYOUT.md
python3 - <<'PY'
import json, pathlib
root = pathlib.Path('apps/design')
marker = json.loads((root/'design.project.json').read_text())
app = json.loads((root/'apps'/'design'/'app.json').read_text())
style = root/marker['stylesRoot']/app['style']/'design.md'
layout = root/marker['layoutsRoot']/app['layout']/'LAYOUT.md'
assert style.is_file(), style
assert layout.is_file(), layout
print('OK', style, layout)
PY
```

Expected: prints `OK` with both paths.

- [ ] **Step 3: Delete `docs/design/`**

```bash
rm -rf docs/design
test ! -e docs/design
```

Expected: `docs/design` gone.

- [ ] **Step 4: Update `apps/design/README.md`**

Replace any `docs/design/design` links/prose with:

- Marker: `design.project.json`
- Style example: `styles/dashboard/design.md`
- Layout example: `layouts/sidebar-shell/LAYOUT.md`
- Note: Assets browser packages under `framework/public/assets/` are a library, not App contracts

- [ ] **Step 5: Update `docs/dev/api/design-fs.md` provenance**

Replace the paragraph that says installed contracts live under `docs/design/<app>/rules|layouts` with:

- Authoritative App contracts: `<designRoot>/<stylesRoot|layoutsRoot>/…` per `docs/dev/api/design-project.md`
- `public/assets` remains browser library only; do not treat it as App contract truth
- Remove “Do not treat `public/assets` as the source of truth for `docs/design/` contracts” → rephrase to point at `styles/` / `layouts/`

- [ ] **Step 6: Commit**

```bash
git add -A apps/design/styles apps/design/layouts apps/design/README.md docs/dev/api/design-fs.md
git add -u docs/design
git commit -m "$(cat <<'EOF'
refactor(design): move style/layout contracts into design project

EOF
)"
```

---

### Task 3: Harden `wn-design-prd` skill

**Files:**
- Modify: `.wn-ai/skills/wn-design-prd/SKILL.md` (full rewrite of path/contract/worktree sections; keep orchestrator pipeline)
- Modify: `.wn-ai/skills/wn-design-prd/README.md`
- Modify: `.wn-ai/skills/wn-design-prd/agents/design-review.md`

**Interfaces:**
- Consumes: `design.project.json` + styles/layouts from Tasks 1–2
- Produces: agent instructions with discovery → recommend → implement → review

- [ ] **Step 1: Replace `.wn-ai/skills/wn-design-prd/SKILL.md` with the following full content**

```markdown
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

**Never** mention or invoke `wn-design-spec`. Never read `docs/design/**`.

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
- Inventing style/layout contract files, or guiding the user to `wn-design-spec` / `docs/design`.
```

- [ ] **Step 2: Replace `.wn-ai/skills/wn-design-prd/README.md`**

```markdown
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
```

- [ ] **Step 3: Update `.wn-ai/skills/wn-design-prd/agents/design-review.md`**

Change only the contract + preview sections to:

- Require the caller to provide `<designRoot>` and resolved paths:
  - Style: `<designRoot>/<stylesRoot>/<styleId>/design.md`
  - Layout: `<designRoot>/<layoutsRoot>/<layoutId>/LAYOUT.md` (or improvise mode)
- Dev server: `cd <designRoot> && npm run dev` (not a hardcoded `apps/design`)
- Remove all `docs/design/...` and `wn-design-spec` mentions
- Keep PASS/PARTIAL/FAIL, Playwright screenshots, and forbidden list otherwise intact

- [ ] **Step 4: Grep gate for the skill tree**

```bash
rg -n 'wn-design-spec|docs/design' .wn-ai/skills/wn-design-prd || true
rg -n 'cd apps/design' .wn-ai/skills/wn-design-prd || true
```

Expected: no matches for `wn-design-spec` or `docs/design`. Prefer `<designRoot>` over bare `cd apps/design`.

- [ ] **Step 5: Commit**

```bash
git add .wn-ai/skills/wn-design-prd
git commit -m "$(cat <<'EOF'
feat(skill): harden wn-design-prd for design.project discovery

EOF
)"
```

---

### Task 4: Memory, IDE mirrors, and supersede old docs

**Files:**
- Modify: `.wn-ai/memories/memory.md`
- Modify: `AGENTS.md`, `CLAUDE.md`, `CODEBUDDY.md`, `GEMINI.md` (same Design Spec / overview wording as memory)
- Modify: `docs/dev/superpowers/specs/2026-07-21-wn-design-prd-design.md` — add status note at top + fix or strikethrough obsolete contract path / `wn-design-spec` decisions
- Modify: `docs/dev/superpowers/specs/2026-07-20-design-engineering-framework-design.md` — note contracts now live in design project; `docs/design` retired
- Modify: `docs/dev/superpowers/plans/2026-07-21-wn-design-prd.md` and `docs/dev/superpowers/plans/2026-07-20-design-engineering-framework.md` — header `Superseded in part by 2026-07-21-design-project-contract-protocol` for contract-path bullets, or rewrite those bullets

**Interfaces:**
- Consumes: Task 1–3 truths
- Produces: single authoritative narrative for agents

- [ ] **Step 1: Rewrite memory Design Spec section**

In `.wn-ai/memories/memory.md`:

- Overview: drop `docs/design` from the “conventions live under …” sentence; mention design project + `docs/dev`.
- Replace **Design Spec** section with:

```markdown
## **Design Spec**

Locate the design-engineering project by finding `design.project.json` (see `docs/dev/api/design-project.md`). For any App UI work:

1. Read `<designRoot>/<contentRoot>/<appId>/app.json` for `style` / `layout` ids.
2. Style contract (required): `<designRoot>/<stylesRoot>/<styleId>/design.md`
3. Layout contract (preferred): `<designRoot>/<layoutsRoot>/<layoutId>/LAYOUT.md`

Default App id is `design.project.json` → `defaultAppId` (this repo: `design`, style `dashboard`, layouts include `sidebar-shell` and `split-screen`).

Do **not** use `docs/design/` (removed) or `wn-design-spec`.
```

- Commands: keep `apps/design` as this repo’s current location, but add “discover via marker; path may differ when installed elsewhere”.

- [ ] **Step 2: Mirror the same Design Spec / overview edits into `AGENTS.md`, `CLAUDE.md`, `CODEBUDDY.md`, `GEMINI.md`**

If a project sync tool exists for memory → IDE files, run it; otherwise edit the four files to match memory’s Overview + Design Spec + Commands wording.

- [ ] **Step 3: Annotate old specs/plans**

At the top of each listed file, add:

```markdown
> **Contract-path update (2026-07-21):** Authoritative style/layout contracts and discovery are defined by `docs/dev/superpowers/specs/2026-07-21-design-project-contract-protocol-design.md` and `docs/dev/api/design-project.md`. Ignore any `docs/design/**` or `wn-design-spec` guidance below.
```

Optionally replace the worst obsolete bullets in-place so `rg docs/design` shrinks.

- [ ] **Step 4: Repo-wide grep gate**

```bash
rg -n 'wn-design-spec|docs/design' \
  .wn-ai/skills/wn-design-prd \
  .wn-ai/memories \
  AGENTS.md CLAUDE.md CODEBUDDY.md GEMINI.md \
  apps/design/README.md \
  docs/dev/api \
  docs/dev/superpowers/specs/2026-07-21-design-project-contract-protocol-design.md \
  || true
```

Expected: no hits except historical mentions inside the protocol spec’s Context (describing the old world) — if those remain, keep them only in past-tense Context, not as instructions.

Also:

```bash
test ! -e docs/design
test -f apps/design/design.project.json
test -f apps/design/styles/dashboard/design.md
```

- [ ] **Step 5: Commit**

```bash
git add .wn-ai/memories/memory.md AGENTS.md CLAUDE.md CODEBUDDY.md GEMINI.md \
  docs/dev/superpowers/specs docs/dev/superpowers/plans
git commit -m "$(cat <<'EOF'
docs: retire docs/design guidance; point memory at design.project protocol

EOF
)"
```

---

### Task 5: End-to-end verification

**Files:** none new (verification only)

- [ ] **Step 1: Structural checks**

```bash
python3 - <<'PY'
import json, pathlib
root = pathlib.Path('apps/design')
m = json.loads((root/'design.project.json').read_text())
assert m['schemaVersion'] == 1
assert (root/m['stylesRoot']/'dashboard'/'design.md').is_file()
assert (root/m['layoutsRoot']/'sidebar-shell'/'LAYOUT.md').is_file()
assert (root/m['contentRoot']/'design'/'app.json').is_file()
assert not pathlib.Path('docs/design').exists()
print('structure OK')
PY
```

- [ ] **Step 2: Skill instruction checks**

```bash
rg -n 'design\.project\.json|stylesRoot|always isolate|AI improvise' .wn-ai/skills/wn-design-prd/SKILL.md
rg -n 'wn-design-spec' .wn-ai/skills/wn-design-prd && exit 1 || echo 'no wn-design-spec OK'
```

Expected: discovery / stylesRoot / isolate / improvise present; no `wn-design-spec`.

- [ ] **Step 3: Design app still builds/tests (sanity; no behavior change intended)**

```bash
cd apps/design && npm test
```

Expected: existing tests PASS.

- [ ] **Step 4: Final commit only if verification fixed stray files; else done**

If Step 1–3 required fixes, commit those fixes. Otherwise no empty commit.

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| `design.project.json` + fields | Task 1 |
| `docs/dev/api` protocol notes | Task 1 |
| Migrate styles/layouts; delete `docs/design` | Task 2 |
| Default App id alignment | Task 2 verify + existing `app.json` |
| Abolish `wn-design-spec`; skill recommend stock ids | Task 3 |
| Worktree always isolate | Task 3 |
| No hardcoded design root in skill/review | Task 3 |
| memory / IDE mirrors / old spec supersede | Task 4 |
| Verification criteria from spec | Task 5 |
| Install scripts out of scope | honored (no task) |
| Do not create contract files on recommend | Task 3 Step 2 rules |

Placeholder scan: no TBD/TODO in steps. Type consistency: marker field names match across Tasks 1–5 (`stylesRoot`, `layoutsRoot`, `contentRoot`, `defaultAppId`, `design.md`, `LAYOUT.md`).

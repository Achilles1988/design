# wn-design-prd controllability & canvas-only redesign

Date: 2026-07-22  
Status: Approved for implementation planning  
Supersedes (in part): `2026-07-21-wn-design-prd-design.md` — specifically shell track parity, optional handoff trigger ambiguity, and pre-implement approval gaps. Unchanged foundations (orchestrator model, design.project.json discovery, framework-agnostic Canvas implement, design-review agent, runner detect) still apply unless this document says otherwise.

## Goal

Make `/wn-design-prd` outputs more controllable by borrowing brainstorming’s approval gates (without calling external brainstorming for Canvas work), and simplify the skill to a **canvas-only** main path. Shell work leaves via an **Exit ramp** that hands off design contracts from `design.project.json`.

## Decisions

| Topic | Decision |
|-------|----------|
| Approach | **B — Canvas-specialized rewrite** of skill docs (not a minimal patch that leaves shell columns) |
| Requirement pack | Always written to disk under `docs/dev/superpowers/specs/YYYY-MM-DD-<appId>-<topic>-canvas-pack.md` |
| Pack purpose | Same-session anchor so the agent does not drift mid-pipeline; not primarily cross-conversation continuity |
| Pack commit | Not required by the skill; user may commit separately |
| HARD-GATE | No Canvas implementation / worktree implement until pack self-review passes and user explicitly approves the pack |
| Sectioned confirm | Three sections then whole-pack approve: (1) scope (2) contracts (3) page intent |
| 2–3 approaches | Only at real forks (split canvases, stock layout vs AI improvise, etc.) — not every run |
| Re-read | Mandatory `Read` of the pack file before Step 5 implement and before Step 7 design-review |
| Todos | TodoWrite tracks pipeline steps only; does not replace pack content |
| Handoff | After Step 9, **always ask once** (default no). If yes, emit a **curated** handoff block |
| Handoff content | UI → “参考” stable Canvas + contract paths; Non-UI → rewritten, concise, final-discussion state (not early verbatim split if it changed) |
| Shell | Not a track. Main skill never edits shell/framework |
| Shell Exit ramp | If host UI is in scope: ask to leave for normal dev flow; if yes, emit shell handoff + invoke `brainstorming` when installed, else tell user to switch to plan mode themselves |
| Shell design refs | Resolve `stylesRoot` / `layoutsRoot` from `design.project.json`; recommend shell-relevant stock paths when they exist; if missing, state clearly that there is no shell style/layout contract |
| Stay on skill after shell ask | If user declines exit: continue Canvas-only or stop; never implement shell inside this skill |

## Scope

### In scope (documentation / skill behavior)

- Update `.wn-ai/skills/wn-design-prd/SKILL.md` and `README.md` (and keep `.cursor/skills` / `.claude/skills` copies in sync if this repo mirrors them).
- Remove `detected + shell` pipeline column and shell implement/review steps from the main flow.
- Add iron-rule HARD-GATE, pack template, self-review, sectioned confirmation, re-read rules.
- Replace Step 10 “If yes” with an explicit ask + curated template.
- Add Shell Exit ramp section + rationalizations/red flags updates.

### Out of scope

- Changing `agents/design-review.md` behavior (unless a one-line cross-ref to pack path is needed).
- Implementing product Canvases or shell UI as part of this change.
- Adding Visual Companion to wn-design-prd.
- Forcing `writing-plans` on the canvas path.
- Auto-committing canvas-pack files.

## Canvas main pipeline (target)

| # | detected | plan |
|---|----------|------|
| 0 | detect & route | detect → plan |
| 0b | locate design project | same |
| 0c | **Shell check** — if host UI in scope → Exit ramp (may end skill for that work) | same |
| 2 | interrogate (one item at a time) + contracts + non-UI split | same |
| 3 | section confirms → write canvas-pack → self-review → **user approve (HARD-GATE)** | same (pack = plan input) |
| 4 | `using-git-worktrees` (always isolate when present) | skip |
| 5 | **Read pack** → implement Canvas drafts | plan → approve → **Read pack** → implement |
| 6 | `requesting-code-review` + fix | skip |
| 7 | **Read pack** → `design-review` + fix | same (canvas) |
| 8 | `finishing-a-development-branch` | skip |
| 9 | non-UI receipt (unconditional; reflect final state) | same |
| 10 | **Ask once** for curated handoff (default no) | same |

Ordering (detected): approve pack → implement → CR → design review → finish → receipt → optional handoff ask.

## Requirement pack

### Path

`docs/dev/superpowers/specs/YYYY-MM-DD-<appId>-<topic>-canvas-pack.md`

### Required fields

- track: `canvas`
- App id
- Canvas list (add / modify / delete)
- style id + resolved repo-relative contract path
- layout id(s) + resolved contract path(s)
- Page intent per Canvas (3–8 bullets)
- Fake-data rules
- Explicitly out of UI scope
- Non-UI initial split (may be refined again at Step 9 / handoff)
- Acceptance checks (preview path shape + visual/interaction bullets)

### Self-review (before asking approval)

1. No TBD / TODO / vague placeholders  
2. Canvas list internally consistent  
3. style/layout files exist on disk  
4. UI vs non-UI not mixed  
5. Scope fits one delivery batch (else decompose first)

### HARD-GATE

Until the user explicitly approves the pack file:

- Do not implement Canvas code  
- Do not start implement inside a worktree  
- Interrogation-time writes to `app.json` style/layout after user confirm remain allowed (they are part of locking contracts, not “implementation of the PRD UI”)

If the pack changes after approval: edit file → self-review → re-approve.

## Curated handoff (Step 10)

Ask (own beat after Step 9):

> Generate a curated handoff prompt for follow-on implementation? Default is no.

If yes, output exactly this shape (filled with **final** discussion state):

```text
Implement: <one-line summary>
UI (done / reference): 参考 <stable paths under designRoot/…>; style/layout contracts <paths>
Key notes: <final locked notes — App, layouts, interactions, fake-data>
Non-UI (to implement): <rewritten, concise, precise final non-UI list | none>
```

Rules:

- UI portion points at delivered design artifacts (“参考 …”), not a re-spec of the whole UI  
- Non-UI must be re-integrated after discussion drift; do not blindly paste the Step 2 first split if it changed  
- Stable paths only — no `localhost` URLs  

## Shell Exit ramp

### Triggers

Requirement explicitly targets host/engineering UI (Apps manager, Rule/Layout browsers, shell theme, sidebar chrome, etc.), or user explicitly asks to change the framework — not “screenshot looks like the shell.”

### Flow

1. State that this skill does **not** edit shell.  
2. Ask whether to leave for normal development flow.  
3. **No** → Canvas-only remainder or stop; never edit shell here.  
4. **Yes** → emit shell handoff pack in the reply:
   - Shell surfaces / acceptance intent (concise)
   - Design refs from `design.project.json` `stylesRoot` / `layoutsRoot` (recommend shell-relevant stock when known, e.g. dashboard style + `sidebar-shell` when those packages exist)
   - If no usable style/layout contracts: **explicitly say there is currently no shell style/layout contract**
   - Any non-UI already separated
5. If `brainstorming` skill is installed → invoke it with that handoff as entry context.  
6. If not → advise the user to switch to plan mode themselves and paste/keep the same handoff.  
7. This skill’s responsibility for the shell work ends after the handoff (+ brainstorming invoke when applicable).

## Documentation cleanup

- Vocabulary: remove Track `shell` as a first-class runner path; document Exit ramp instead.  
- Rationalizations / red flags: replace “keep shell runner steps” with “do not implement shell here; use Exit ramp.”  
- README: canvas-only + Exit ramp + pack HARD-GATE + curated handoff ask — short.

## Non-goals / anti-patterns

- Offering shell vs Canvas as a routine A/B for product PRDs  
- Calling external brainstorming for normal Canvas interrogation  
- Skipping pack approve because the change “looks small”  
- Treating handoff as optional-with-no-ask (`If yes` without a question)  
- Inventing shell contracts when `stylesRoot` / `layoutsRoot` entries are missing  

## Open points (none blocking)

- Whether mirrored skill copies under `.cursor/skills` and `.claude/skills` are updated by the same change set: **yes, keep in sync** when those trees exist in-repo.

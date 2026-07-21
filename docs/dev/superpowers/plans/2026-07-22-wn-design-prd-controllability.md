# wn-design-prd Controllability Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `.wn-ai/skills/wn-design-prd` so the skill is canvas-only, requires a disk-backed requirement pack + HARD-GATE before implement, asks once for a curated handoff, and routes shell work out via an Exit ramp.

**Architecture:** Documentation-only change to the skill instruction surface. No app runtime code. Foundations (detect runner, `design.project.json`, framework-agnostic Canvas implement, design-review agent) stay; shell track is removed; brainstorming-style controllability gates are inlined without calling external brainstorming for Canvas work.

**Tech Stack:** Markdown skill docs under `.wn-ai/skills/wn-design-prd/`; verification via ripgrep checklists against the approved spec.

**Spec:** `docs/dev/superpowers/specs/2026-07-22-wn-design-prd-controllability-design.md`

## Global Constraints

- Skill body language: **English** (match existing `SKILL.md` / `design-review.md`).
- Do **not** edit `agents/design-review.md` (leave unchanged).
- Do **not** invent `.cursor/skills` or `.claude/skills` mirrors — this repo only has `.wn-ai/skills/wn-design-prd/`.
- skill text must remain **framework-agnostic** for Canvas implementation (no React/Vue code samples).
- Do **not** call external brainstorming for normal Canvas interrogation.
- Pack path must be exactly: `docs/dev/superpowers/specs/YYYY-MM-DD-<appId>-<topic>-canvas-pack.md`
- No auto-commit of canvas-pack files required by the skill.
- **Authoritative full-file fixtures** (avoid nested markdown fences in this plan):
  - `docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-SKILL.md`
  - `docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-README.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-SKILL.md` | Golden SKILL body (already written with the plan) |
| `docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-README.md` | Golden README body |
| `.wn-ai/skills/wn-design-prd/SKILL.md` | Install target — copy from fixture |
| `.wn-ai/skills/wn-design-prd/README.md` | Install target — copy from fixture |
| `.wn-ai/skills/wn-design-prd/agents/design-review.md` | Unchanged |
| `docs/dev/superpowers/specs/2026-07-21-wn-design-prd-design.md` | Add supersession banner |

---

### Task 1: Install `SKILL.md` from fixture

**Files:**
- Modify: `.wn-ai/skills/wn-design-prd/SKILL.md`
- Source: `docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-SKILL.md`

**Interfaces:**
- Consumes: fixture file (must match spec decisions)
- Produces: live skill at `.wn-ai/skills/wn-design-prd/SKILL.md`

- [ ] **Step 1: Copy fixture over the live skill**

```bash
cp docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-SKILL.md \
  .wn-ai/skills/wn-design-prd/SKILL.md
```

- [ ] **Step 2: Confirm frontmatter and size**

```bash
head -n 5 .wn-ai/skills/wn-design-prd/SKILL.md
wc -l .wn-ai/skills/wn-design-prd/SKILL.md
```

Expected: `name: wn-design-prd` in frontmatter; roughly 250+ lines (not a stub).

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

### Task 2: Install `README.md` from fixture

**Files:**
- Modify: `.wn-ai/skills/wn-design-prd/README.md`
- Source: `docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-README.md`

**Interfaces:**
- Consumes: README fixture
- Produces: live README aligned with Task 1

- [ ] **Step 1: Copy fixture**

```bash
cp docs/dev/superpowers/plans/fixtures/2026-07-22-wn-design-prd-README.md \
  .wn-ai/skills/wn-design-prd/README.md
```

- [ ] **Step 2: Spot-check key phrases**

```bash
rg -n "Canvas only|Exit ramp|HARD-GATE|canvas-pack" .wn-ai/skills/wn-design-prd/README.md
```

Expected: all four concepts present.

- [ ] **Step 3: Commit**

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

- [ ] **Step 1: Insert this banner immediately after the H1 (keep the existing contract-path note):**

```markdown
> **Controllability update (2026-07-22):** Shell track parity, handoff trigger, and pre-implement approval are superseded by `docs/dev/superpowers/specs/2026-07-22-wn-design-prd-controllability-design.md`. Treat that document as authoritative for canvas-only flow, requirement pack HARD-GATE, curated handoff ask, and Shell Exit ramp.
```

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
- Test: `.wn-ai/skills/wn-design-prd/SKILL.md`, `README.md`

**Interfaces:**
- Consumes: Task 1–2 outputs
- Produces: pass/fail against spec anti-patterns

- [ ] **Step 1: Forbidden shell-track language**

```bash
rg -n "detected \+ shell|Track\`: \`shell\`" .wn-ai/skills/wn-design-prd/SKILL.md .wn-ai/skills/wn-design-prd/README.md || true
```

Expected: no matches for a shell pipeline/track column.

- [ ] **Step 2: Required phrases in SKILL**

```bash
rg -n "HARD-GATE|canvas-pack\.md|Exit ramp|always ask once|Read the approved pack|brainstorming" .wn-ai/skills/wn-design-prd/SKILL.md
```

Expected: each concept appears at least once.

- [ ] **Step 3: Handoff ask is explicit (not ask-less)**

```bash
rg -n "always ask once|Generate a curated handoff" .wn-ai/skills/wn-design-prd/SKILL.md
```

Expected: both present; “If yes, output exactly” only appears **after** the ask.

- [ ] **Step 4: Manual checklist against spec Decisions table**

- [ ] Pack path exact
- [ ] HARD-GATE before implement/worktree implement
- [ ] Three section confirms
- [ ] Re-read before Step 5 and 7
- [ ] Handoff ask + curated template fields
- [ ] Exit ramp: ask → handoff with stylesRoot/layoutsRoot or “no shell contract” → brainstorming else suggest plan mode
- [ ] No shell implementation path in pipeline table

- [ ] **Step 5: Commit fixes only if Steps 1–4 required edits**

```bash
# only if you changed fixtures and re-copied:
git add docs/dev/superpowers/plans/fixtures/ .wn-ai/skills/wn-design-prd/SKILL.md .wn-ai/skills/wn-design-prd/README.md
git commit -m "$(cat <<'EOF'
docs(skill): fix wn-design-prd verification gaps
EOF
)"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Canvas-only rewrite / remove shell track column | Task 1 fixture |
| Pack path + fields + self-review + HARD-GATE | Task 1 fixture Step 3 |
| Section confirms | Task 1 fixture |
| Re-read before 5/7 | Task 1 fixture |
| Curated handoff ask | Task 1 fixture Step 10 |
| Shell Exit ramp + brainstorming / suggest plan | Task 1 fixture Step 0c |
| stylesRoot/layoutsRoot or “no contract” | Task 1 fixture Step 0c |
| README update | Task 2 |
| Sync .cursor/.claude mirrors | N/A — mirrors absent |
| design-review.md unchanged | Global Constraints |
| Supersession pointer | Task 3 |
| Verification | Task 4 |

Placeholder scan: none. Fixture paths are the single source of full file bodies (avoids broken nested fences in the plan).

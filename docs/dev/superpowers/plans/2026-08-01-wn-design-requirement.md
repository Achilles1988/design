# wn-design-requirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the lean `wn-design-requirement` skill (check scripts + SKILL.md + App Token API docs) so agents can create/update Canvases under App `tokens.css` + DESIGN.md without the old `wn-design-prd` orchestration gates.

**Architecture:** Pure Node ESM helpers under the skill `scripts/` directory discover `design.project.json`, validate App style slots, and check `tokens.css` fingerprint headers. Agents (not scripts) regenerate tokens and implement Canvases per SKILL.md. Public protocol is documented in `docs/dev/api/app-tokens.md`.

**Tech Stack:** Node.js ESM, `node:test` + `node:assert`, Markdown skill docs, existing `design.project.json` / `app.json` contracts.

## Global Constraints

- Spec: `docs/dev/superpowers/specs/2026-08-01-wn-design-requirement-design.md`
- Discovery/style resolution: `docs/dev/api/design-project.md` (do not hardcode `apps/design`)
- Lessons: `.wn-ai/lessons/lesson.md` (style mandatory; dual-slot; layout preference)
- Coding standards: `docs/dev/conventions/coding-standards.md`, workflow: `docs/dev/conventions/mandatory.md`
- SKILL.md / README body: English
- Scripts never parse DESIGN.md token values and never write `tokens.css`
- Fingerprint header (only configured slots; order light then dark when both):

```css
/* @app-tokens fingerprint
 * light:<styleId>:<sha256>
 * dark:<styleId>:<sha256>
 */
```

- Hash = SHA-256 hex of DESIGN.md / design.md **file bytes**
- `wn-design-prd` skill files are already deleted on `main` (commit `eb3b841e`); do not recreate them
- Do not edit stock packages under `stylesRoot` / `layoutsRoot`
- Shell `framework/src/styles/tokens.css` is out of scope for App Canvas tokens

## File Map

**Create**

- `.wn-ai/skills/wn-design-requirement/scripts/lib.mjs` — shared discovery, style resolve, fingerprint parse/expected
- `.wn-ai/skills/wn-design-requirement/scripts/lib.test.mjs` — unit tests for lib
- `.wn-ai/skills/wn-design-requirement/scripts/find-design-root.mjs`
- `.wn-ai/skills/wn-design-requirement/scripts/list-apps.mjs`
- `.wn-ai/skills/wn-design-requirement/scripts/check-app-style.mjs`
- `.wn-ai/skills/wn-design-requirement/scripts/check-app-tokens.mjs`
- `.wn-ai/skills/wn-design-requirement/scripts/cli.test.mjs` — CLI exit-code tests with temp fixtures
- `.wn-ai/skills/wn-design-requirement/SKILL.md`
- `.wn-ai/skills/wn-design-requirement/README.md`
- `docs/dev/api/app-tokens.md`

**Modify**

- `docs/dev/api/design-project.md` — add See also → `app-tokens.md`

**Already done (do not redo)**

- Delete `.wn-ai/skills/wn-design-prd/*`
- Spec `docs/dev/superpowers/specs/2026-08-01-wn-design-requirement-design.md`

---

### Task 1: Shared lib — discovery, style resolve, fingerprint

**Files:**
- Create: `.wn-ai/skills/wn-design-requirement/scripts/lib.mjs`
- Test: `.wn-ai/skills/wn-design-requirement/scripts/lib.test.mjs`

**Interfaces:**
- Produces:
  - `findDesignRoots(repoRoot: string): string[]` — absolute dirs containing `design.project.json` (skip `node_modules`)
  - `readMarker(designRoot: string): { schemaVersion, contentRoot, stylesRoot, layoutsRoot, defaultAppId }`
  - `listAppIds(designRoot: string): string[]`
  - `resolveStyleContractPath(designRoot: string, styleId: string): string | null` — first existing `DESIGN.md` or `design.md` under stylesRoot
  - `getConfiguredSlots(appJson: object): Array<{ slot: 'light'|'dark', styleId: string }>`
  - `validateAppStyle(designRoot: string, appId: string): { ok: true, slots } | { ok: false, reason: string }`
  - `sha256File(absPath: string): string`
  - `expectedFingerprintLines(designRoot: string, appId: string): string[]` — `light:id:hash` lines for configured valid slots
  - `parseFingerprintHeader(tokensCss: string): Map<string, { styleId: string, hash: string }>` — keyed by slot
  - `checkAppTokens(designRoot: string, appId: string): { ok: true } | { ok: false, reason: string }`
  - `appDir(designRoot: string, appId: string): string`
  - `readAppJson(designRoot: string, appId: string): object`

- [ ] **Step 1: Write failing tests**

Create `lib.test.mjs`:

```js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import {
  findDesignRoots,
  getConfiguredSlots,
  parseFingerprintHeader,
  checkAppTokens,
  validateAppStyle,
  sha256File,
  expectedFingerprintLines,
} from './lib.mjs'

describe('lib', () => {
  let root
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'wn-design-req-'))
    mkdirSync(join(root, 'proj', 'apps', 'demo'), { recursive: true })
    mkdirSync(join(root, 'proj', 'styles', 'default'), { recursive: true })
    writeFileSync(
      join(root, 'proj', 'design.project.json'),
      JSON.stringify({
        schemaVersion: 1,
        contentRoot: 'apps',
        stylesRoot: 'styles',
        layoutsRoot: 'layouts',
        defaultAppId: 'demo',
      }),
    )
    writeFileSync(join(root, 'proj', 'styles', 'default', 'DESIGN.md'), '# Default\n')
    writeFileSync(
      join(root, 'proj', 'apps', 'demo', 'app.json'),
      JSON.stringify({ id: 'demo', name: 'demo', style: { light: 'default' }, layouts: [] }),
    )
  })
  after(() => rmSync(root, { recursive: true, force: true }))

  it('findDesignRoots finds marker', () => {
    const roots = findDesignRoots(root)
    assert.deepEqual(roots, [join(root, 'proj')])
  })

  it('getConfiguredSlots skips empty', () => {
    assert.deepEqual(getConfiguredSlots({ style: { light: 'default' } }), [
      { slot: 'light', styleId: 'default' },
    ])
    assert.deepEqual(getConfiguredSlots({ style: {} }), [])
  })

  it('validateAppStyle ok for valid light', () => {
    const r = validateAppStyle(join(root, 'proj'), 'demo')
    assert.equal(r.ok, true)
  })

  it('validateAppStyle fails when no slots', () => {
    writeFileSync(
      join(root, 'proj', 'apps', 'demo', 'app.json'),
      JSON.stringify({ id: 'demo', style: {}, layouts: [] }),
    )
    const r = validateAppStyle(join(root, 'proj'), 'demo')
    assert.equal(r.ok, false)
    writeFileSync(
      join(root, 'proj', 'apps', 'demo', 'app.json'),
      JSON.stringify({ id: 'demo', name: 'demo', style: { light: 'default' }, layouts: [] }),
    )
  })

  it('parseFingerprintHeader reads slots', () => {
    const map = parseFingerprintHeader(`/* @app-tokens fingerprint
 * light:default:abc
 * dark:dashboard:def
 */
:root{}`)
    assert.equal(map.get('light').styleId, 'default')
    assert.equal(map.get('light').hash, 'abc')
    assert.equal(map.get('dark').styleId, 'dashboard')
  })

  it('checkAppTokens fails when missing file', () => {
    const r = checkAppTokens(join(root, 'proj'), 'demo')
    assert.equal(r.ok, false)
  })

  it('checkAppTokens passes matching fingerprint', () => {
    const designRoot = join(root, 'proj')
    const lines = expectedFingerprintLines(designRoot, 'demo')
    assert.equal(lines.length, 1)
    writeFileSync(
      join(designRoot, 'apps', 'demo', 'tokens.css'),
      `/* @app-tokens fingerprint\n * ${lines[0]}\n */\n[data-theme='light']{--color-text:#111}\n`,
    )
    const r = checkAppTokens(designRoot, 'demo')
    assert.equal(r.ok, true)
  })

  it('sha256File matches crypto', () => {
    const p = join(root, 'proj', 'styles', 'default', 'DESIGN.md')
    const expect = createHash('sha256').update('# Default\n').digest('hex')
    assert.equal(sha256File(p), expect)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test .wn-ai/skills/wn-design-requirement/scripts/lib.test.mjs
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement `lib.mjs`**

```js
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'

export function findDesignRoots(repoRoot) {
  const hits = []
  function walk(dir) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue
      const p = join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (ent.name === 'design.project.json') hits.push(dir)
    }
  }
  walk(repoRoot)
  return hits.sort()
}

export function readMarker(designRoot) {
  return JSON.parse(readFileSync(join(designRoot, 'design.project.json'), 'utf8'))
}

export function appDir(designRoot, appId) {
  const { contentRoot } = readMarker(designRoot)
  return join(designRoot, contentRoot, appId)
}

export function readAppJson(designRoot, appId) {
  return JSON.parse(readFileSync(join(appDir(designRoot, appId), 'app.json'), 'utf8'))
}

export function listAppIds(designRoot) {
  const { contentRoot } = readMarker(designRoot)
  const base = join(designRoot, contentRoot)
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(base, d.name, 'app.json')))
    .map((d) => d.name)
    .sort()
}

export function resolveStyleContractPath(designRoot, styleId) {
  const { stylesRoot } = readMarker(designRoot)
  const dir = join(designRoot, stylesRoot, styleId)
  for (const name of ['DESIGN.md', 'design.md']) {
    const p = join(dir, name)
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

export function getConfiguredSlots(appJson) {
  const style = appJson?.style
  if (!style || typeof style !== 'object' || Array.isArray(style)) return []
  const out = []
  for (const slot of ['light', 'dark']) {
    const id = style[slot]
    if (typeof id === 'string' && id.trim()) out.push({ slot, styleId: id.trim() })
  }
  return out
}

export function validateAppStyle(designRoot, appId) {
  let appJson
  try {
    appJson = readAppJson(designRoot, appId)
  } catch {
    return { ok: false, reason: `missing app.json for ${appId}` }
  }
  const slots = getConfiguredSlots(appJson)
  if (slots.length === 0) {
    return { ok: false, reason: 'app.json.style has no light/dark slot configured' }
  }
  for (const { slot, styleId } of slots) {
    if (!resolveStyleContractPath(designRoot, styleId)) {
      return {
        ok: false,
        reason: `style.${slot}="${styleId}" has no DESIGN.md/design.md under stylesRoot`,
      }
    }
  }
  return { ok: true, slots }
}

export function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex')
}

export function expectedFingerprintLines(designRoot, appId) {
  const v = validateAppStyle(designRoot, appId)
  if (!v.ok) throw new Error(v.reason)
  return v.slots.map(({ slot, styleId }) => {
    const path = resolveStyleContractPath(designRoot, styleId)
    return `${slot}:${styleId}:${sha256File(path)}`
  })
}

export function parseFingerprintHeader(tokensCss) {
  const map = new Map()
  const block = tokensCss.match(/\/\*\s*@app-tokens fingerprint\s*([\s\S]*?)\*\//)
  if (!block) return map
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*\*\s*(light|dark):([^:]+):([a-f0-9]+)\s*$/i)
    if (m) map.set(m[1].toLowerCase(), { styleId: m[2], hash: m[3].toLowerCase() })
  }
  return map
}

export function checkAppTokens(designRoot, appId) {
  const style = validateAppStyle(designRoot, appId)
  if (!style.ok) return style
  const tokensPath = join(appDir(designRoot, appId), 'tokens.css')
  if (!existsSync(tokensPath)) return { ok: false, reason: 'tokens.css missing' }
  const parsed = parseFingerprintHeader(readFileSync(tokensPath, 'utf8'))
  if (parsed.size === 0) return { ok: false, reason: 'fingerprint header missing or unparsable' }
  let expected
  try {
    expected = expectedFingerprintLines(designRoot, appId)
  } catch (e) {
    return { ok: false, reason: e.message }
  }
  if (parsed.size !== expected.length) {
    return { ok: false, reason: 'fingerprint slot count mismatch' }
  }
  for (const line of expected) {
    const [slot, styleId, hash] = line.split(':')
    const got = parsed.get(slot)
    if (!got) return { ok: false, reason: `fingerprint missing slot ${slot}` }
    if (got.styleId !== styleId || got.hash !== hash) {
      return { ok: false, reason: `fingerprint stale for ${slot}` }
    }
  }
  return { ok: true }
}

export { dirname, join }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test .wn-ai/skills/wn-design-requirement/scripts/lib.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .wn-ai/skills/wn-design-requirement/scripts/lib.mjs \
        .wn-ai/skills/wn-design-requirement/scripts/lib.test.mjs
git commit -m "$(cat <<'EOF'
feat(wn-design-requirement): add shared design-root and token fingerprint lib

EOF
)"
```

---

### Task 2: CLI scripts + exit-code fixtures

**Files:**
- Create: `.wn-ai/skills/wn-design-requirement/scripts/find-design-root.mjs`
- Create: `.wn-ai/skills/wn-design-requirement/scripts/list-apps.mjs`
- Create: `.wn-ai/skills/wn-design-requirement/scripts/check-app-style.mjs`
- Create: `.wn-ai/skills/wn-design-requirement/scripts/check-app-tokens.mjs`
- Test: `.wn-ai/skills/wn-design-requirement/scripts/cli.test.mjs`

**Interfaces:**
- Consumes: exports from `lib.mjs` (Task 1)
- Produces: CLIs
  - `find-design-root.mjs [repoRoot]` → exit `0` print one abs path; `2` if zero; `3` if many (print all)
  - `list-apps.mjs <designRoot>` → exit `0`, one app id per line
  - `check-app-style.mjs <designRoot> <appId>` → `0` ok / `1` fail + reason on stderr
  - `check-app-tokens.mjs <designRoot> <appId>` → `0` ok / `1` fail + reason on stderr

- [ ] **Step 1: Write failing CLI test**

```js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expectedFingerprintLines } from './lib.mjs'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))

function run(script, args) {
  return spawnSync(process.execPath, [join(scriptsDir, script), ...args], {
    encoding: 'utf8',
  })
}

describe('cli', () => {
  let root, designRoot
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'wn-cli-'))
    designRoot = join(root, 'proj')
    mkdirSync(join(designRoot, 'apps', 'demo'), { recursive: true })
    mkdirSync(join(designRoot, 'styles', 'default'), { recursive: true })
    writeFileSync(
      join(designRoot, 'design.project.json'),
      JSON.stringify({
        schemaVersion: 1,
        contentRoot: 'apps',
        stylesRoot: 'styles',
        layoutsRoot: 'layouts',
        defaultAppId: 'demo',
      }),
    )
    writeFileSync(join(designRoot, 'styles', 'default', 'DESIGN.md'), 'x')
    writeFileSync(
      join(designRoot, 'apps', 'demo', 'app.json'),
      JSON.stringify({ id: 'demo', style: { light: 'default' }, layouts: [] }),
    )
  })
  after(() => rmSync(root, { recursive: true, force: true }))

  it('find-design-root exits 0 for one', () => {
    const r = run('find-design-root.mjs', [root])
    assert.equal(r.status, 0)
    assert.equal(r.stdout.trim(), designRoot)
  })

  it('find-design-root exits 2 for none', () => {
    const empty = mkdtempSync(join(tmpdir(), 'wn-empty-'))
    const r = run('find-design-root.mjs', [empty])
    assert.equal(r.status, 2)
    rmSync(empty, { recursive: true, force: true })
  })

  it('list-apps prints demo', () => {
    const r = run('list-apps.mjs', [designRoot])
    assert.equal(r.status, 0)
    assert.equal(r.stdout.trim(), 'demo')
  })

  it('check-app-style ok', () => {
    const r = run('check-app-style.mjs', [designRoot, 'demo'])
    assert.equal(r.status, 0)
  })

  it('check-app-tokens fails without file', () => {
    const r = run('check-app-tokens.mjs', [designRoot, 'demo'])
    assert.equal(r.status, 1)
  })

  it('check-app-tokens ok with fingerprint', () => {
    const lines = expectedFingerprintLines(designRoot, 'demo')
    writeFileSync(
      join(designRoot, 'apps', 'demo', 'tokens.css'),
      `/* @app-tokens fingerprint\n * ${lines[0]}\n */\n`,
    )
    const r = run('check-app-tokens.mjs', [designRoot, 'demo'])
    assert.equal(r.status, 0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test .wn-ai/skills/wn-design-requirement/scripts/cli.test.mjs
```

- [ ] **Step 3: Implement the four CLIs**

`find-design-root.mjs`:

```js
#!/usr/bin/env node
import { findDesignRoots } from './lib.mjs'

const repoRoot = process.argv[2] ?? process.cwd()
const roots = findDesignRoots(repoRoot)
if (roots.length === 0) {
  console.error('No design.project.json found. Install a design-engineering project.')
  process.exit(2)
}
if (roots.length > 1) {
  console.error('Multiple design projects found; choose one:')
  for (const r of roots) console.log(r)
  process.exit(3)
}
console.log(roots[0])
```

`list-apps.mjs`:

```js
#!/usr/bin/env node
import { listAppIds } from './lib.mjs'

const designRoot = process.argv[2]
if (!designRoot) {
  console.error('Usage: list-apps.mjs <designRoot>')
  process.exit(1)
}
for (const id of listAppIds(designRoot)) console.log(id)
```

`check-app-style.mjs`:

```js
#!/usr/bin/env node
import { validateAppStyle } from './lib.mjs'

const [designRoot, appId] = process.argv.slice(2)
if (!designRoot || !appId) {
  console.error('Usage: check-app-style.mjs <designRoot> <appId>')
  process.exit(1)
}
const r = validateAppStyle(designRoot, appId)
if (!r.ok) {
  console.error(r.reason)
  process.exit(1)
}
console.log('ok')
```

`check-app-tokens.mjs`:

```js
#!/usr/bin/env node
import { checkAppTokens } from './lib.mjs'

const [designRoot, appId] = process.argv.slice(2)
if (!designRoot || !appId) {
  console.error('Usage: check-app-tokens.mjs <designRoot> <appId>')
  process.exit(1)
}
const r = checkAppTokens(designRoot, appId)
if (!r.ok) {
  console.error(r.reason)
  process.exit(1)
}
console.log('ok')
```

- [ ] **Step 4: Run — expect PASS**

```bash
node --test .wn-ai/skills/wn-design-requirement/scripts/lib.test.mjs \
           .wn-ai/skills/wn-design-requirement/scripts/cli.test.mjs
```

- [ ] **Step 5: Smoke against this repo**

```bash
node .wn-ai/skills/wn-design-requirement/scripts/find-design-root.mjs .
node .wn-ai/skills/wn-design-requirement/scripts/list-apps.mjs "$(node .wn-ai/skills/wn-design-requirement/scripts/find-design-root.mjs .)"
node .wn-ai/skills/wn-design-requirement/scripts/check-app-style.mjs "$(node .wn-ai/skills/wn-design-requirement/scripts/find-design-root.mjs .)" design
node .wn-ai/skills/wn-design-requirement/scripts/check-app-tokens.mjs "$(node .wn-ai/skills/wn-design-requirement/scripts/find-design-root.mjs .)" design; echo exit:$?
```

Expected: find/list/style succeed; tokens check fails with `tokens.css missing` (exit 1) until an agent generates it later—that is correct.

- [ ] **Step 6: Commit**

```bash
git add .wn-ai/skills/wn-design-requirement/scripts/
git commit -m "$(cat <<'EOF'
feat(wn-design-requirement): add design check CLIs

EOF
)"
```

---

### Task 3: Public API docs

**Files:**
- Create: `docs/dev/api/app-tokens.md`
- Modify: `docs/dev/api/design-project.md` (See also)

- [ ] **Step 1: Write `docs/dev/api/app-tokens.md`**

Full content:

```markdown
# App tokens (`tokens.css`)

Per-App CSS design tokens for Canvas pages, separate from Shell
`framework/src/styles/tokens.css`.

## Path

`<designRoot>/<contentRoot>/<appId>/tokens.css`

Resolved via `design.project.json` (see [design-project.md](./design-project.md)).

## Fingerprint

Header required at the top of the file. Only **configured** `app.json.style`
slots appear. Slot order: `light` then `dark` when both exist.

Hash = SHA-256 hex of the resolved stock `DESIGN.md` or `design.md` **file bytes**.

```css
/* @app-tokens fingerprint
 * light:<styleId>:<sha256>
 * dark:<styleId>:<sha256>
 */
```

## Theme blocks

Emit selectors only for configured slots:

- light → `[data-theme='light'] { ... }`
- dark → `[data-theme='dark'] { ... }` (may also set `:root` to the App's default polarity when documenting generation)

Minimum variables: `--color-primary`, `--color-surface`, `--color-surface-2`,
`--color-text`, `--color-border`, `--color-muted`, `--color-success`,
`--color-warning`, `--color-danger`, `--font-sans`.

Canvas code imports this file and uses `var(--*)`. Follow `<html data-theme>`
from Shell theme toggle; do not add a Canvas-local theme switch.

## Who writes vs who checks

| Actor | May write `tokens.css`? | May parse DESIGN.md body? |
|-------|-------------------------|---------------------------|
| Agent (`wn-design-requirement`) | Yes, on missing/stale | Yes |
| Skill scripts `check-app-tokens` | No | No (hash file bytes only) |
| Shell `sync:tokens` | No (Shell file only) | Shell only |

## Check CLI

From repo (paths relative to skill):

```bash
node .wn-ai/skills/wn-design-requirement/scripts/check-app-tokens.mjs <designRoot> <appId>
```

Exit `0` when fingerprint matches; `1` when missing/stale/invalid style.

## See also

- [design-project.md](./design-project.md)
- [shell-tokens.md](./shell-tokens.md) — Shell chrome only
```

- [ ] **Step 2: Append to See also in `design-project.md`**

Add:

```markdown
- [app-tokens.md](app-tokens.md) — per-App Canvas `tokens.css` fingerprint protocol
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/api/app-tokens.md docs/dev/api/design-project.md
git commit -m "$(cat <<'EOF'
docs(api): document per-App tokens.css fingerprint protocol

EOF
)"
```

---

### Task 4: SKILL.md + README

**Files:**
- Create: `.wn-ai/skills/wn-design-requirement/SKILL.md`
- Create: `.wn-ai/skills/wn-design-requirement/README.md`

**Methodology note:** Skill TDD normally baselines failing agent behavior before writing SKILL.md. For this plan, capture at least three pressure scenarios in README (or a short `PRESSURE.md`) and run one baseline + one with-skill check during verification (Task 5). Do not skip the scenario list.

- [ ] **Step 1: Write `SKILL.md`** (exact content below)

````markdown
---
name: wn-design-requirement
description: Use when creating or modifying a design App Canvas from a user requirement — locate the design project, validate App styles, ensure App tokens.css, then implement previewable UI following tokens and DESIGN.md with fake data and shell theme linkage.
---

# wn-design-requirement

Lean Canvas authoring skill. Produce the UI the user asked for inside a
design-engineering App. No requirement pack, worktree, code review,
design-review gate, or multi-skill orchestration.

## Iron rules

1. **Discover via `design.project.json`.** Never hardcode a design-root path.
2. **Style is mandatory.** At least one valid `app.json.style` slot (`light` /
   `dark`) with stock `DESIGN.md` / `design.md`. If missing, stop and tell the
   user to configure styles — do not install styles in this skill.
3. **App tokens before paint.** Ensure `<appDir>/tokens.css` exists and its
   fingerprint matches configured DESIGN.md hashes. If missing/stale, **you**
   regenerate it (scripts only check).
4. **Tokens + DESIGN.md bind implementation.** No off-spec colors/fonts. Reference
   images/links never override style — including "exact copy" mode.
5. **Theme follows Shell.** Use CSS variables under `[data-theme='light'|'dark']`
   for every configured slot. Follow `<html data-theme>`. No Canvas-local theme
   toggle. Do not invent an unconfigured polarity.
6. **Fake data.** Fill realistic placeholders; no real backend.
7. **Canvas only.** Do not edit Shell/framework sources.
8. **Stay lean.** Do not invoke worktree / CR / design-review / brainstorming
   orchestration unless the user separately asks for those skills.

## Vocabulary

- **Design root:** directory with `design.project.json`.
- **App:** `<designRoot>/<contentRoot>/<appId>/` (`app.json`, `canvases.json`, `canvases/*`, `tokens.css`).
- **Canvas:** previewable page under `canvases/`, listed in `canvases.json`.
- **App tokens:** `<appDir>/tokens.css` — see `docs/dev/api/app-tokens.md`.

## Scripts (prefer these for checks)

From the repository root (adjust if cwd differs):

| Script | Purpose | Exit |
|--------|---------|------|
| `scripts/find-design-root.mjs [repoRoot]` | Find design root | 0 one; 2 none; 3 many |
| `scripts/list-apps.mjs <designRoot>` | List app ids | 0 |
| `scripts/check-app-style.mjs <designRoot> <appId>` | Valid style slots | 0/1 |
| `scripts/check-app-tokens.mjs <designRoot> <appId>` | Fingerprint fresh | 0/1 |

Script paths are relative to this skill directory:
`.wn-ai/skills/wn-design-requirement/scripts/`.

## Pipeline

### 1 — Find design project

Run `find-design-root.mjs`. On 2: stop with install hint. On 3: ask which root.
On 0: read marker (`contentRoot`, `stylesRoot`, `layoutsRoot`, `defaultAppId`).

### 2 — Identify App

Infer from the user. If unclear, ask (may suggest `defaultAppId`). Confirm with
`list-apps.mjs` when helpful.

### 3 — Validate styles

Run `check-app-style.mjs`. On failure: stop; remind user to configure
`app.json.style` slots to stock packages. Do not write style ids unless the user
explicitly asked you to configure styles **outside** this skill's default stop.

### 4 — Create vs modify

Lock add vs edit and target Canvas id(s). Ask if unclear.

### 5 — App tokens

Run `check-app-tokens.mjs`. On failure: Read each configured slot's DESIGN.md,
write `<appDir>/tokens.css` with:

1. Fingerprint header (`docs/dev/api/app-tokens.md`)
2. Theme blocks only for configured slots
3. Minimum semantic variables listed in the API doc

If DESIGN.md mapping is ambiguous, ask — do not invent a conflicting palette.
Re-run `check-app-tokens.mjs` until exit 0.

### 6 — Clarify requirement

Ask until implementable (one question at a time; prefer multiple choice).

**If the user provided images and/or reference links**, ask this before coding:

1. Exact copy
2. Redesign components while keeping original functionality
3. Creative reference only (interaction / layout inspiration)

**All three modes still must obey App tokens + DESIGN.md.**

### 7 — Implement

- Match existing Canvas tech stack in the App (framework-agnostic).
- Import App `tokens.css`; use `var(--*)` for themed values.
- Prefer installed layout contracts; blend if none fit.
- Sync `canvases.json` on add/delete.
- After adding a new Canvas, restart `npm run dev` from `<designRoot>` before
  preview if the bundler glob requires it.
- Dual configured slots: both must look correct when Shell toggles theme.

## Rationalizations (forbidden)

| Excuse | Reality |
|--------|---------|
| "Exact copy needs the reference hex" | Restyle with App tokens; structure may match, palette may not |
| "Shell tokens.css is enough" | App Canvas uses App `tokens.css` |
| "Only ship light; dark later" | Implement every configured slot |
| "Configure a style for the user silently" | Stop and ask them to configure |
| "Run wn-design-prd / worktree / design-review" | Out of scope; user composes other skills |

## Red flags — stop and fix

- Hardcoded design-root path
- Implementing with empty/invalid style
- Skipping token regenerate when check fails
- Off-spec colors while "matching" a screenshot
- Editing Shell/framework in this skill
- Fabricating the missing theme polarity
````

- [ ] **Step 2: Write `README.md`**

```markdown
# wn-design-requirement

Lean skill: turn a UI requirement into a previewable App Canvas under the App's
style contracts and `tokens.css`.

## Usage

```text
/wn-design-requirement
```

## Checks

```bash
node scripts/find-design-root.mjs <repoRoot>
node scripts/list-apps.mjs <designRoot>
node scripts/check-app-style.mjs <designRoot> <appId>
node scripts/check-app-tokens.mjs <designRoot> <appId>
```

## Docs

- Spec: `docs/dev/superpowers/specs/2026-08-01-wn-design-requirement-design.md`
- API: `docs/dev/api/app-tokens.md`

## Pressure scenarios (verification)

1. No `design.project.json` → agent stops with install hint (does not invent paths).
2. App with empty `style` → agent stops; does not invent style ids.
3. User attaches a screenshot → agent asks mode 1/2/3 before coding; still uses App tokens.
4. App has light+dark slots → Canvas follows `data-theme` for both; no local theme toggle.
5. `tokens.css` missing → agent writes fingerprint-valid file before Canvas paint.
```

- [ ] **Step 3: Commit**

```bash
git add .wn-ai/skills/wn-design-requirement/SKILL.md \
        .wn-ai/skills/wn-design-requirement/README.md
git commit -m "$(cat <<'EOF'
feat(wn-design-requirement): add lean Canvas authoring skill docs

EOF
)"
```

---

### Task 5: Verification + optional live App tokens for `design`

**Files:**
- Optionally create: `apps/design/apps/design/tokens.css` (only if you run a live regenerate for the default App to prove the check passes — not required for skill MVP if smoke already showed missing-file failure)

- [ ] **Step 1: Re-run all script tests**

```bash
node --test .wn-ai/skills/wn-design-requirement/scripts/lib.test.mjs \
           .wn-ai/skills/wn-design-requirement/scripts/cli.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Repo smoke**

```bash
DR=$(node .wn-ai/skills/wn-design-requirement/scripts/find-design-root.mjs .)
node .wn-ai/skills/wn-design-requirement/scripts/list-apps.mjs "$DR"
node .wn-ai/skills/wn-design-requirement/scripts/check-app-style.mjs "$DR" design
```

Expected: style ok.

- [ ] **Step 3: Pressure checklist (manual or subagent)**

Walk README scenarios 1–5 against SKILL.md. Record pass/fail in the commit message body or a short note in the PR — no new process gates beyond this verification.

- [ ] **Step 4: Final commit only if Step 3 produced file fixes**

If SKILL wording changed to close a loophole:

```bash
git add .wn-ai/skills/wn-design-requirement/
git commit -m "$(cat <<'EOF'
fix(wn-design-requirement): tighten skill wording after pressure checks

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Replace wn-design-prd | Already deleted; SKILL is sole entry (Task 4) |
| Find design project / install hint | Tasks 1–2, 4 |
| Identify App / ask | Task 4 pipeline §2 |
| Style gate stop | Tasks 1–2, 4 |
| Create vs modify | Task 4 §4 |
| App tokens path + fingerprint | Tasks 1–3 |
| Agent generates tokens; scripts check only | Tasks 1–4 |
| 1–2 DESIGN.md slots in one file | Tasks 3–4 |
| Shell `data-theme` linkage + dual slot | Task 4 iron rules |
| Reference modes 1/2/3 + still obey style | Task 4 §6 |
| Fake data | Task 4 iron rule 6 |
| No pack/worktree/CR/design-review | Task 4 iron rule 8 |
| `docs/dev/api/app-tokens.md` | Task 3 |
| Check scripts | Task 2 |

## Placeholder / consistency check

- Fingerprint format identical in spec, lib regex, API doc, SKILL.
- Exit codes: find `2`/`3`; checks `1` on failure.
- No TBD left in tasks.

---

## Execution handoff

Plan complete and saved to `docs/dev/superpowers/plans/2026-08-01-wn-design-requirement.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with executing-plans checkpoints  

Which approach?

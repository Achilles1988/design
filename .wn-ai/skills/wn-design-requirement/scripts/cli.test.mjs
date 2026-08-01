import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expectedFingerprintLines } from './lib.mjs'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [join(scriptsDir, script), ...args], {
    encoding: 'utf8',
    ...options,
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

  it('find-design-root prints an absolute path for a relative repoRoot', () => {
    const r = run('find-design-root.mjs', ['.'], { cwd: root })
    assert.equal(r.status, 0)
    assert.equal(r.stdout.trim(), join(realpathSync(root), 'proj'))
  })

  it('find-design-root exits 2 for none', () => {
    const empty = mkdtempSync(join(tmpdir(), 'wn-empty-'))
    const r = run('find-design-root.mjs', [empty])
    assert.equal(r.status, 2)
    rmSync(empty, { recursive: true, force: true })
  })

  it('find-design-root exits 3 for multiple', () => {
    const multi = mkdtempSync(join(tmpdir(), 'wn-multi-'))
    const rootA = join(multi, 'a')
    const rootB = join(multi, 'b')
    mkdirSync(rootA, { recursive: true })
    mkdirSync(rootB, { recursive: true })
    writeFileSync(join(rootA, 'design.project.json'), '{}')
    writeFileSync(join(rootB, 'design.project.json'), '{}')
    const r = run('find-design-root.mjs', [multi])
    assert.equal(r.status, 3)
    assert.match(r.stderr, /multiple/i)
    assert.deepEqual(r.stdout.trim().split('\n').sort(), [rootA, rootB].sort())
    rmSync(multi, { recursive: true, force: true })
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

  it('check-app-style fails with reason when DESIGN.md missing', () => {
    const bad = mkdtempSync(join(tmpdir(), 'wn-style-'))
    const badRoot = join(bad, 'proj')
    mkdirSync(join(badRoot, 'apps', 'ghost'), { recursive: true })
    mkdirSync(join(badRoot, 'styles', 'missing'), { recursive: true })
    writeFileSync(
      join(badRoot, 'design.project.json'),
      JSON.stringify({
        schemaVersion: 1,
        contentRoot: 'apps',
        stylesRoot: 'styles',
        layoutsRoot: 'layouts',
        defaultAppId: 'ghost',
      }),
    )
    writeFileSync(
      join(badRoot, 'apps', 'ghost', 'app.json'),
      JSON.stringify({ id: 'ghost', style: { light: 'missing' }, layouts: [] }),
    )
    const r = run('check-app-style.mjs', [badRoot, 'ghost'])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /DESIGN\.md/i)
    rmSync(bad, { recursive: true, force: true })
  })

  it('check-app-tokens fails without file', () => {
    const r = run('check-app-tokens.mjs', [designRoot, 'demo'])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /tokens\.css missing/i)
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

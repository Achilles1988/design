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

  it('findDesignRoots skips .worktrees and worktrees', () => {
    mkdirSync(join(root, '.worktrees', 'feature', 'apps', 'design'), { recursive: true })
    writeFileSync(join(root, '.worktrees', 'feature', 'apps', 'design', 'design.project.json'), '{}')
    mkdirSync(join(root, 'worktrees', 'other', 'apps', 'design'), { recursive: true })
    writeFileSync(join(root, 'worktrees', 'other', 'apps', 'design', 'design.project.json'), '{}')
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

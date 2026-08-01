import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'worktrees'])

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
      if (SKIP_DIRS.has(ent.name)) continue
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

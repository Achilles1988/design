import fs from 'node:fs/promises'
import path from 'node:path'
import type { AssetEntry, AssetKind } from '../../src/lib/types'
import { resolveContentPath } from './paths'
import { zipPackageUnderRoot } from './zip'

export const ASSET_KINDS = ['designmd', 'layoutmd'] as const

const PREVIEW_FILE: Record<AssetKind, string> = {
  designmd: 'components.html',
  layoutmd: 'preview.html',
}

export function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value)
}

function isValidAssetId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)
}

export function createAssetsStore(assetsRoot: string) {
  const root = path.resolve(assetsRoot)

  async function listAssets(kind: AssetKind): Promise<AssetEntry[]> {
    const kindDir = resolveContentPath(root, kind)
    let names: string[]
    try {
      names = await fs.readdir(kindDir)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return []
      throw err
    }

    const previewFile = PREVIEW_FILE[kind]
    const entries: AssetEntry[] = []

    for (const id of names.sort()) {
      if (id.startsWith('.') || id.startsWith('_')) continue
      if (!isValidAssetId(id)) continue
      const previewAbs = resolveContentPath(kindDir, id, previewFile)
      try {
        const st = await fs.stat(previewAbs)
        if (!st.isFile()) continue
      } catch {
        continue
      }
      entries.push({
        id,
        name: id,
        previewUrl: `/assets/${kind}/${id}/${previewFile}`,
      })
    }

    return entries
  }

  async function pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }

  async function assertPackageDir(kind: AssetKind, id: string): Promise<string> {
    if (!isValidAssetId(id)) {
      throw new Error(`Invalid asset id: ${id}`)
    }
    const dir = resolveContentPath(root, kind, id)
    try {
      const st = await fs.stat(dir)
      if (!st.isDirectory()) {
        throw new Error(`Asset not found: ${kind}/${id}`)
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new Error(`Asset not found: ${kind}/${id}`)
      }
      throw err
    }

    if (kind === 'designmd') {
      const hasContract =
        (await pathExists(path.join(dir, 'DESIGN.md'))) ||
        (await pathExists(path.join(dir, 'design.md')))
      if (!hasContract) {
        throw new Error(`Style contract missing: ${kind}/${id}/DESIGN.md`)
      }
    } else {
      if (!(await pathExists(path.join(dir, 'LAYOUT.md')))) {
        throw new Error(`Layout contract missing: ${kind}/${id}/LAYOUT.md`)
      }
    }

    return dir
  }

  async function downloadPackage(kind: AssetKind, id: string): Promise<Buffer> {
    // Download only requires the package directory; contract checks are for apply.
    if (!isValidAssetId(id)) {
      throw new Error(`Invalid asset id: ${id}`)
    }
    const dir = resolveContentPath(root, kind, id)
    try {
      const st = await fs.stat(dir)
      if (!st.isDirectory()) {
        throw new Error(`Asset not found: ${kind}/${id}`)
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new Error(`Asset not found: ${kind}/${id}`)
      }
      throw err
    }
    return zipPackageUnderRoot(root, kind, id)
  }

  return {
    listAssets,
    assertPackageDir,
    downloadPackage,
  }
}

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

export type ContractRoots = {
  stylesRoot: string
  layoutsRoot: string
}

export function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value)
}

function isValidAssetId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(from, to)
    } else if (entry.isFile()) {
      await fs.copyFile(from, to)
    }
  }
}

/** Ensure style contracts expose lowercase `design.md` for resolution. */
async function normalizeStyleContract(targetDir: string): Promise<void> {
  const designMd = path.join(targetDir, 'design.md')
  if (await pathExists(designMd)) return

  for (const candidate of ['DESIGN.md', 'Design.md']) {
    const from = path.join(targetDir, candidate)
    if (await pathExists(from)) {
      await fs.copyFile(from, designMd)
      return
    }
  }
}

export function createAssetsStore(
  assetsRoot: string,
  contracts?: ContractRoots,
) {
  const root = path.resolve(assetsRoot)
  const stylesRoot = contracts
    ? path.resolve(contracts.stylesRoot)
    : undefined
  const layoutsRoot = contracts
    ? path.resolve(contracts.layoutsRoot)
    : undefined

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
    return dir
  }

  async function downloadPackage(kind: AssetKind, id: string): Promise<Buffer> {
    await assertPackageDir(kind, id)
    return zipPackageUnderRoot(root, kind, id)
  }

  async function installPackage(
    kind: AssetKind,
    id: string,
  ): Promise<{ targetDir: string }> {
    if (!stylesRoot || !layoutsRoot) {
      throw new Error('Contract roots are not configured')
    }

    const src = await assertPackageDir(kind, id)
    const contractRoot = kind === 'designmd' ? stylesRoot : layoutsRoot
    const targetDir = resolveContentPath(contractRoot, id)
    const stagingDir = `${targetDir}.__installing`

    await fs.rm(stagingDir, { recursive: true, force: true })
    try {
      await copyDir(src, stagingDir)
      if (kind === 'designmd') {
        await normalizeStyleContract(stagingDir)
      }
      await fs.rm(targetDir, { recursive: true, force: true })
      await fs.rename(stagingDir, targetDir)
    } catch (err) {
      await fs.rm(stagingDir, { recursive: true, force: true })
      throw err
    }

    return { targetDir }
  }

  return {
    listAssets,
    downloadPackage,
    installPackage,
  }
}

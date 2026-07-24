import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {
  parseIndexMarkdown,
  type AssetMeta,
} from '../../src/lib/ai/assetIndex'
import type { AppConfig, CanvasEntry } from '../../src/lib/types'
import { createContentStore } from '../design-fs/store'

const USER_COMPONENT_EXTENSIONS = new Set(['.ts', '.tsx', '.css'])
const NEW_COMPONENT_EXTENSIONS = new Set(['.tsx', '.css'])
const CANVAS_STYLE_EXTENSION = '.css'

export type AuthoringFile = {
  relativePath: string
  absolutePath: string
  source: string
  hash: string
  permission: 'write-existing' | 'read-only'
}

type AuthoringContract = {
  id: string
  relativePath: string
  source: string
}

export type CanvasAuthoringContext = {
  app: AppConfig
  canvas: CanvasEntry
  style: AuthoringContract
  installedLayouts: AuthoringContract[]
  layoutIndex: AssetMeta[]
  files: AuthoringFile[]
  componentsDir: string
}

export type CanvasContextLoaderOptions = {
  contentRoot: string
  stylesRoot: string
  layoutsRoot: string
}

export type CandidateOperation = 'write-existing' | 'create-shared'

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex')
}

function importedCssFiles(canvasSource: string): string[] {
  return ts
    .preProcessFile(canvasSource, true, true)
    .importedFiles
    .map((item) => item.fileName)
    .filter((fileName) => path.extname(fileName) === CANVAS_STYLE_EXTENSION)
}

function isWithin(allowedRoot: string, resolved: string): boolean {
  const relative = path.relative(allowedRoot, resolved)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

function resolveWithin(allowedRoot: string, ...segments: string[]): string {
  const root = path.resolve(allowedRoot)
  const resolved = path.resolve(root, ...segments)
  if (!isWithin(root, resolved)) {
    throw new Error('Path is outside the allowed root.')
  }
  return resolved
}

async function existingPathWithin(
  allowedRoot: string,
  resolved: string,
): Promise<string> {
  if (!isWithin(path.resolve(allowedRoot), path.resolve(resolved))) {
    throw new Error('Path is outside the allowed root.')
  }
  const [realRoot, realResolved] = await Promise.all([
    fs.realpath(allowedRoot),
    fs.realpath(resolved),
  ])
  if (!isWithin(realRoot, realResolved)) {
    throw new Error('Path is outside the allowed root.')
  }
  return realResolved
}

async function resolvesToPath(
  allowedRoot: string,
  candidate: string,
  expectedRealPath: string,
): Promise<boolean> {
  try {
    return (
      await existingPathWithin(allowedRoot, candidate)
    ) === expectedRealPath
  } catch {
    return false
  }
}

function toRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/')
}

function lstatEntry(filePath: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function readAuthoringFile(
  appDir: string,
  absolutePath: string,
  permission: AuthoringFile['permission'],
): Promise<AuthoringFile> {
  const source = await fs.readFile(absolutePath, 'utf8')
  return {
    relativePath: toRelativePath(appDir, absolutePath),
    absolutePath,
    source,
    hash: sha256(source),
    permission,
  }
}

async function loadContract(
  root: string,
  id: string,
  fileNames: string[],
): Promise<AuthoringContract | null> {
  let packageDir: string
  try {
    packageDir = resolveWithin(root, id)
    await existingPathWithin(root, packageDir)
  } catch {
    return null
  }

  let entries: string[]
  try {
    entries = await fs.readdir(packageDir)
  } catch {
    return null
  }

  for (const fileName of fileNames) {
    if (!entries.includes(fileName)) continue
    const contractPath = resolveWithin(packageDir, fileName)
    try {
      await existingPathWithin(root, contractPath)
      return {
        id,
        relativePath: toRelativePath(root, contractPath),
        source: await fs.readFile(contractPath, 'utf8'),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return null
      }
    }
  }
  return null
}

async function scanComponentFiles(
  appDir: string,
  componentsDir: string,
): Promise<AuthoringFile[]> {
  try {
    const rootStat = await fs.lstat(componentsDir)
    if (!rootStat.isDirectory()) return []
    await existingPathWithin(appDir, componentsDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    return []
  }

  const files: AuthoringFile[] = []
  const visitedDirectories = new Set<string>()

  async function visit(directory: string): Promise<void> {
    let realDirectory: string
    try {
      realDirectory = await existingPathWithin(componentsDir, directory)
    } catch {
      return
    }
    if (visitedDirectories.has(realDirectory)) return
    visitedDirectories.add(realDirectory)

    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = resolveWithin(directory, entry.name)
      let realEntry: string
      try {
        realEntry = await existingPathWithin(componentsDir, absolutePath)
      } catch {
        continue
      }
      const stat = await fs.stat(realEntry)
      if (stat.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (
        stat.isFile() &&
        USER_COMPONENT_EXTENSIONS.has(path.extname(entry.name))
      ) {
        files.push(
          await readAuthoringFile(appDir, absolutePath, 'read-only'),
        )
      }
    }
  }

  await visit(componentsDir)
  return files
}

async function loadLayoutIndex(layoutsRoot: string): Promise<AssetMeta[]> {
  const indexPath = resolveWithin(layoutsRoot, 'INDEX.md')
  try {
    await existingPathWithin(layoutsRoot, indexPath)
    return parseIndexMarkdown(await fs.readFile(indexPath, 'utf8'))
  } catch {
    return []
  }
}

function assertCreateSharedPath(
  context: CanvasAuthoringContext,
  relativePath: string,
): void {
  if (
    path.isAbsolute(relativePath) ||
    !NEW_COMPONENT_EXTENSIONS.has(path.extname(relativePath))
  ) {
    throw new Error('Candidate path is not an allowed shared component.')
  }

  const appDir = path.dirname(context.componentsDir)
  const absolutePath = path.resolve(appDir, relativePath)
  const relativeToComponents = path.relative(context.componentsDir, absolutePath)
  if (
    relativeToComponents.length === 0 ||
    relativeToComponents.startsWith('..') ||
    path.isAbsolute(relativeToComponents) ||
    lstatEntry(absolutePath) !== null
  ) {
    throw new Error('Candidate path is not an allowed shared component.')
  }

  const componentsStat = lstatEntry(context.componentsDir)
  if (componentsStat !== null) {
    if (
      !componentsStat.isDirectory() ||
      componentsStat.isSymbolicLink()
    ) {
      throw new Error('Candidate path is not an allowed shared component.')
    }
    const realComponentsDir = realpathSync(context.componentsDir)
    let existingAncestor = path.dirname(absolutePath)
    while (
      isWithin(context.componentsDir, existingAncestor)
    ) {
      const ancestorStat = lstatEntry(existingAncestor)
      if (ancestorStat !== null) {
        if (
          !ancestorStat.isDirectory() ||
          ancestorStat.isSymbolicLink() ||
          !isWithin(realComponentsDir, realpathSync(existingAncestor))
        ) {
          throw new Error('Candidate path is not an allowed shared component.')
        }
      }
      existingAncestor = path.dirname(existingAncestor)
    }
  }
}

export function validateCandidatePath(
  context: CanvasAuthoringContext,
  relativePath: string,
  operation: CandidateOperation,
): CandidateOperation {
  if (operation === 'write-existing') {
    const existing = context.files.find(
      (file) =>
        file.relativePath === relativePath &&
        file.permission === 'write-existing',
    )
    if (!existing) {
      throw new Error('Candidate path is not writable.')
    }
    return operation
  }

  assertCreateSharedPath(context, relativePath)
  return operation
}

export function createCanvasContextLoader(
  options: CanvasContextLoaderOptions,
) {
  const contentRoot = path.resolve(options.contentRoot)
  const stylesRoot = path.resolve(options.stylesRoot)
  const layoutsRoot = path.resolve(options.layoutsRoot)
  const store = createContentStore(contentRoot)

  async function load(
    appId: string,
    canvasId: string,
  ): Promise<CanvasAuthoringContext> {
    const appDir = resolveWithin(contentRoot, appId)
    await existingPathWithin(contentRoot, appDir)

    const [app, canvases] = await Promise.all([
      store.getApp(appId),
      store.listCanvases(appId),
    ])
    const canvas = canvases.find((entry) => entry.id === canvasId)
    if (!canvas) {
      throw new Error('Canvas source could not be loaded.')
    }

    const canvasesDir = resolveWithin(appDir, 'canvases')
    let canvasFile: AuthoringFile
    let cssFiles: AuthoringFile[]
    try {
      if (
        canvas.component !== path.basename(canvas.component) ||
        path.extname(canvas.component) !== '.tsx'
      ) {
        throw new Error('Canvas component must be a direct TSX file.')
      }
      const canvasPath = resolveWithin(canvasesDir, canvas.component)
      await existingPathWithin(appDir, canvasesDir)
      const realCanvasPath = await existingPathWithin(
        canvasesDir,
        canvasPath,
      )
      for (const otherCanvas of canvases) {
        if (otherCanvas === canvas) continue
        let otherPath: string
        try {
          otherPath = resolveWithin(
            canvasesDir,
            otherCanvas.component,
          )
        } catch {
          continue
        }
        if (
          otherPath === canvasPath ||
          (await resolvesToPath(canvasesDir, otherPath, realCanvasPath))
        ) {
          throw new Error('Canvas component is shared.')
        }
      }
      canvasFile = await readAuthoringFile(
        appDir,
        canvasPath,
        'write-existing',
      )
      cssFiles = await Promise.all(
        importedCssFiles(canvasFile.source).map(async (importedFile) => {
          const canvasDirectory = path.dirname(canvasPath)
          const localFileName = importedFile.slice(2)
          if (
            !importedFile.startsWith('./') ||
            localFileName !== path.basename(localFileName)
          ) {
            throw new Error('Canvas CSS must be a direct local import.')
          }
          const cssPath = path.resolve(canvasDirectory, importedFile)
          const cssStat = await fs.lstat(cssPath)
          if (!cssStat.isFile() || cssStat.isSymbolicLink()) {
            throw new Error('Canvas CSS must be a regular file.')
          }
          await existingPathWithin(canvasDirectory, cssPath)
          return readAuthoringFile(appDir, cssPath, 'write-existing')
        }),
      )
    } catch {
      throw new Error('Canvas source could not be loaded.')
    }

    const style = await loadContract(
      stylesRoot,
      app.style,
      ['DESIGN.md', 'design.md'],
    )
    if (!style) {
      throw new Error('The configured Style contract could not be loaded.')
    }

    const installedLayouts = (
      await Promise.all(
        app.layouts.map((id) =>
          loadContract(layoutsRoot, id, ['LAYOUT.md']),
        ),
      )
    ).filter((contract): contract is AuthoringContract => contract !== null)

    const componentsDir = resolveWithin(appDir, 'components')
    const [componentFiles, layoutIndex] = await Promise.all([
      scanComponentFiles(appDir, componentsDir),
      loadLayoutIndex(layoutsRoot),
    ])
    const files = [...cssFiles, canvasFile, ...componentFiles].sort(
      (left, right) => left.relativePath.localeCompare(right.relativePath),
    )

    return {
      app,
      canvas,
      style,
      installedLayouts,
      layoutIndex,
      files,
      componentsDir,
    }
  }

  return { load, validateCandidatePath }
}

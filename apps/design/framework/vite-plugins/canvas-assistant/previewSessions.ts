import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import type { CanvasPreviewSessionRequest } from '../../src/lib/canvasAssistantProtocol'
import { createContentStore } from '../design-fs/store'

export const CANVAS_PREVIEW_MODULE_PREFIX =
  '/__design_canvas_preview/'
export const CANVAS_PREVIEW_SESSION_TTL_MS = 30 * 60 * 1000
const MAX_PREVIEW_SESSIONS = 256

const RUNTIME_MODULE_PATHS = new Set([
  '/@react-refresh',
  '/@vite/client',
  '/node_modules/vite/dist/client/env.mjs',
  '/framework/src/preview/canvasPreviewFrame.tsx',
  '/framework/src/preview/loadCanvasModule.ts',
  '/framework/src/preview/canvasReveal.css',
  '/framework/src/styles/global.css',
  '/framework/src/styles/tokens.css',
])
const RUNTIME_MODULE_PREFIXES = ['/node_modules/.vite/deps/']
const COMPONENT_MODULE_EXTENSIONS = new Set(['.ts', '.tsx', '.css'])
const APP_TOKENS_CSS_IMPORT = '../tokens.css'
const APP_TOKENS_CSS_FILE = 'tokens.css'

export type CanvasPreviewTarget = CanvasPreviewSessionRequest & {
  componentFile: string
  canvasModulePaths: string[]
  componentModulePaths: string[]
  guardedModuleFiles: CanvasPreviewGuardedModuleFile[]
}

export type CanvasPreviewGuardedModuleFile = {
  modulePath: string
  absolutePath: string
  realPath: string
}

type CanvasPreviewSession = CanvasPreviewTarget & {
  expiresAt: number
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function requireRealPathWithin(
  root: string,
  candidate: string,
  message = 'Canvas preview target is outside the App.',
): Promise<string> {
  const [realRoot, realCandidate] = await Promise.all([
    fs.realpath(root),
    fs.realpath(candidate),
  ])
  if (!isWithin(realRoot, realCandidate)) {
    throw new Error(message)
  }
  return realCandidate
}

function importedCanvasCss(source: string): string[] {
  return ts
    .preProcessFile(source, true, true)
    .importedFiles
    .map((item) => item.fileName)
    .filter((fileName) => path.extname(fileName) === '.css')
}

export function createCanvasPreviewTargetLoader(options: {
  contentRoot: string
}): (
  request: CanvasPreviewSessionRequest,
) => Promise<CanvasPreviewTarget> {
  const contentRoot = path.resolve(options.contentRoot)
  const store = createContentStore(contentRoot)

  return async (request) => {
    const appDir = path.resolve(contentRoot, request.appId)
    const realAppDir = await requireRealPathWithin(
      contentRoot,
      appDir,
      'Canvas preview App is outside the content root.',
    )
    const canvases = await store.listCanvases(request.appId)
    const canvas = canvases.find(
      (entry) => entry.id === request.canvasId,
    )
    if (
      !canvas ||
      canvas.component !== path.basename(canvas.component) ||
      path.extname(canvas.component) !== '.tsx' ||
      /[\\\0-\x1f\x7f?#]/.test(canvas.component)
    ) {
      throw new Error('Canvas preview target was not found.')
    }

    const canvasesDir = path.resolve(appDir, 'canvases')
    await requireRealPathWithin(realAppDir, canvasesDir)
    const canvasPath = path.resolve(canvasesDir, canvas.component)
    const canvasStat = await fs.lstat(canvasPath)
    if (!canvasStat.isFile() || canvasStat.isSymbolicLink()) {
      throw new Error('Canvas preview target must be a regular file.')
    }
    const realCanvasPath = await requireRealPathWithin(
      canvasesDir,
      canvasPath,
    )
    const source = await fs.readFile(realCanvasPath, 'utf8')
    const canvasModulePaths = [
      `/apps/${request.appId}/canvases/${canvas.component}`,
    ]
    const guardedModuleFiles: CanvasPreviewGuardedModuleFile[] = [
      {
        modulePath: canvasModulePaths[0],
        absolutePath: canvasPath,
        realPath: realCanvasPath,
      },
    ]

    for (const importedFile of importedCanvasCss(source)) {
      if (importedFile === APP_TOKENS_CSS_IMPORT) {
        const tokensPath = path.resolve(appDir, APP_TOKENS_CSS_FILE)
        const tokensStat = await fs.lstat(tokensPath)
        if (!tokensStat.isFile() || tokensStat.isSymbolicLink()) {
          throw new Error('Canvas preview CSS target is invalid.')
        }
        const realTokensPath = await requireRealPathWithin(
          realAppDir,
          tokensPath,
        )
        const modulePath = `/apps/${request.appId}/${APP_TOKENS_CSS_FILE}`
        canvasModulePaths.push(modulePath)
        guardedModuleFiles.push({
          modulePath,
          absolutePath: tokensPath,
          realPath: realTokensPath,
        })
        continue
      }

      const localName = importedFile.slice(2)
      if (
        !importedFile.startsWith('./') ||
        localName !== path.basename(localName)
      ) {
        throw new Error('Canvas preview CSS target is invalid.')
      }
      const cssPath = path.resolve(canvasesDir, localName)
      const cssStat = await fs.lstat(cssPath)
      if (!cssStat.isFile() || cssStat.isSymbolicLink()) {
        throw new Error('Canvas preview CSS target is invalid.')
      }
      const realCssPath = await requireRealPathWithin(
        canvasesDir,
        cssPath,
      )
      const modulePath =
        `/apps/${request.appId}/canvases/${localName}`
      canvasModulePaths.push(modulePath)
      guardedModuleFiles.push({
        modulePath,
        absolutePath: cssPath,
        realPath: realCssPath,
      })
    }

    const componentModulePaths: string[] = []
    const componentsDir = path.resolve(appDir, 'components')
    try {
      const realComponentsDir = await requireRealPathWithin(
        realAppDir,
        componentsDir,
      )
      const visit = async (directory: string): Promise<void> => {
        const entries = await fs.readdir(directory, {
          withFileTypes: true,
        })
        for (const entry of entries) {
          const entryPath = path.resolve(directory, entry.name)
          const entryStat = await fs.lstat(entryPath)
          if (entryStat.isSymbolicLink()) continue
          if (entryStat.isDirectory()) {
            await requireRealPathWithin(realComponentsDir, entryPath)
            await visit(entryPath)
            continue
          }
          if (
            !entryStat.isFile() ||
            !COMPONENT_MODULE_EXTENSIONS.has(path.extname(entry.name))
          ) {
            continue
          }
          const realEntryPath = await requireRealPathWithin(
            realComponentsDir,
            entryPath,
          )
          const relativePath = path
            .relative(appDir, entryPath)
            .split(path.sep)
            .join('/')
          const modulePath = `/apps/${request.appId}/${relativePath}`
          componentModulePaths.push(modulePath)
          guardedModuleFiles.push({
            modulePath,
            absolutePath: entryPath,
            realPath: realEntryPath,
          })
        }
      }
      await visit(componentsDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    componentModulePaths.sort()
    guardedModuleFiles.sort((left, right) =>
      left.modulePath.localeCompare(right.modulePath),
    )

    return {
      ...request,
      componentFile: canvas.component,
      canvasModulePaths,
      componentModulePaths,
      guardedModuleFiles,
    }
  }
}

function decodeModulePath(pathname: string): string | null {
  let decoded = pathname
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) {
        if (
          !next.startsWith('/') ||
          next.includes('\\') ||
          /[?#\0-\x1f\x7f]/.test(next) ||
          path.posix.normalize(next) !== next
        ) {
          return null
        }
        return next
      }
      decoded = next
    } catch {
      return null
    }
  }
  return null
}

async function isCurrentGuardedModuleFile(
  guardedFile: CanvasPreviewGuardedModuleFile,
): Promise<boolean> {
  try {
    const stat = await fs.lstat(guardedFile.absolutePath)
    if (!stat.isFile() || stat.isSymbolicLink()) return false
    return (await fs.realpath(guardedFile.absolutePath)) ===
      guardedFile.realPath
  } catch {
    return false
  }
}

async function canReadModule(
  session: CanvasPreviewSession,
  rawPathname: string,
): Promise<boolean> {
  const pathname = decodeModulePath(rawPathname)
  if (!pathname) return false
  if (
    RUNTIME_MODULE_PATHS.has(pathname) ||
    RUNTIME_MODULE_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix) && pathname.endsWith('.js'),
    )
  ) {
    return true
  }
  if (
    !session.canvasModulePaths.includes(pathname) &&
    !session.componentModulePaths.includes(pathname)
  ) {
    return false
  }
  const guardedFile = session.guardedModuleFiles.find(
    (entry) => entry.modulePath === pathname,
  )
  return guardedFile
    ? isCurrentGuardedModuleFile(guardedFile)
    : false
}

export function createCanvasPreviewSessionStore({
  now = Date.now,
  createToken = randomUUID,
  ttlMs = CANVAS_PREVIEW_SESSION_TTL_MS,
}: {
  now?: () => number
  createToken?: () => string
  ttlMs?: number
} = {}) {
  const sessions = new Map<string, CanvasPreviewSession>()

  const prune = () => {
    const currentTime = now()
    for (const [token, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(token)
    }
    while (sessions.size >= MAX_PREVIEW_SESSIONS) {
      const oldest = sessions.keys().next().value as string | undefined
      if (!oldest) break
      sessions.delete(oldest)
    }
  }

  const issue = (target: CanvasPreviewTarget) => {
    prune()
    const token = createToken()
    const expiresAt = now() + ttlMs
    sessions.set(token, {
      ...target,
      canvasModulePaths: [...target.canvasModulePaths],
      componentModulePaths: [...target.componentModulePaths],
      guardedModuleFiles: target.guardedModuleFiles.map((entry) => ({
        ...entry,
      })),
      expiresAt,
    })
    return {
      moduleBase: `${CANVAS_PREVIEW_MODULE_PREFIX}${token}/`,
      componentFile: target.componentFile,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  }

  const authorize = async (
    token: string,
    pathname: string,
  ): Promise<boolean> => {
    const session = sessions.get(token)
    if (!session) return false
    if (session.expiresAt <= now()) {
      sessions.delete(token)
      return false
    }
    return canReadModule(session, pathname)
  }

  return { authorize, issue }
}

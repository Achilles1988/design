import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_LAYOUT,
  type AppConfig,
  type CanvasEntry,
  type CanvasesFile,
  type StyleSlot,
} from '../../src/lib/types'
import { normalizeStyleSlots } from '../../src/lib/styleSlots'
import { isValidAppId } from '../../src/lib/slug'
import { validatePathMeta } from '../../src/lib/pathMeta'
import { resolveContentPath } from './paths'

const TS_IDENTIFIER = /^[A-Za-z_][a-zA-Z0-9_]*$/

function toPascalCase(value: string): string {
  return value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Normalize on-disk app.json (migrates legacy `layout` string → `layouts`). */
export function normalizeAppConfig(raw: Record<string, unknown>): AppConfig {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const name = typeof raw.name === 'string' ? raw.name : ''
  const style = normalizeStyleSlots(raw.style)

  let layouts: string[] = []
  if (Array.isArray(raw.layouts)) {
    layouts = raw.layouts.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
  } else if (typeof raw.layout === 'string' && raw.layout.trim()) {
    layouts = [raw.layout.trim()]
  }
  if (layouts.length === 0) {
    layouts = [DEFAULT_LAYOUT]
  }

  const app: AppConfig = { id, name, style, layouts }
  if (typeof raw.path === 'string') {
    app.path = raw.path
  }
  return app
}

export function nameToComponentFile(name: string, id: string): string {
  const fromName = toPascalCase(name)
  const base =
    fromName && TS_IDENTIFIER.test(fromName) ? fromName : toPascalCase(id)
  return `${base}.tsx`
}

function requireNonEmptyName(name: string, label: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }
  return trimmed
}

export function canvasPlaceholderSource(
  componentFile: string,
  _canvasName: string,
): string {
  const fn = componentFile.replace(/\.tsx$/, '')
  return `export default function ${fn}() {\n  return null\n}\n`
}

async function readCanvasesFile(appDir: string): Promise<CanvasesFile> {
  const canvasesPath = resolveContentPath(appDir, 'canvases.json')
  const raw = await fs.readFile(canvasesPath, 'utf8')
  return JSON.parse(raw) as CanvasesFile
}

async function writeCanvasesFile(
  appDir: string,
  data: CanvasesFile,
): Promise<void> {
  const canvasesPath = resolveContentPath(appDir, 'canvases.json')
  await fs.writeFile(
    canvasesPath,
    `${JSON.stringify(data, null, 2)}\n`,
    'utf8',
  )
}

export function createContentStore(contentRoot: string) {
  const root = path.resolve(contentRoot)

  function appDir(id: string): string {
    return resolveContentPath(root, id)
  }

  async function readAppFile(id: string): Promise<AppConfig> {
    if (!isValidAppId(id)) {
      throw new Error(`Invalid app id: ${id}`)
    }
    const file = resolveContentPath(root, id, 'app.json')
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return normalizeAppConfig(parsed)
  }

  async function writeAppFile(app: AppConfig): Promise<void> {
    await fs.writeFile(
      resolveContentPath(root, app.id, 'app.json'),
      `${JSON.stringify(app, null, 2)}\n`,
      'utf8',
    )
  }

  async function getApp(id: string): Promise<AppConfig> {
    return readAppFile(id)
  }

  async function listApps(): Promise<AppConfig[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(root)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    const apps: AppConfig[] = []
    for (const entry of entries) {
      try {
        apps.push(await readAppFile(entry))
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        const isInvalidId = err instanceof Error && /^Invalid app id/.test(err.message)
        if (code === 'ENOENT' || isInvalidId) {
          // Not an app directory: no app.json, or entry doesn't look like an
          // app id (e.g. `.DS_Store`). Nothing to surface.
          continue
        }
        // The directory has an app.json but it failed to parse/normalize
        // (e.g. legacy `style: string`); skip it from the result but make
        // the failure visible instead of swallowing it silently.
        const message = err instanceof Error ? err.message : String(err)
        const migrationHint = /style must be an object/i.test(message)
          ? ' Fix: rewrite "style" to { "light"?: "<id>", "dark"?: "<id>" } in app.json.'
          : ''
        console.warn(
          `[design-fs] listApps: skipping app "${entry}" at ${appDir(entry)}: ${message}${migrationHint}`,
        )
      }
    }
    return apps
  }

  async function createApp(input: {
    id: string
    name: string
    path?: string
  }): Promise<AppConfig> {
    const { id } = input
    if (!isValidAppId(id)) {
      throw new Error(`Invalid app id: ${id}`)
    }
    const name = requireNonEmptyName(input.name, 'App name')
    const pathMeta = validatePathMeta(input.path)
    if (!pathMeta.ok) {
      throw new Error(pathMeta.error)
    }

    const dir = appDir(id)
    try {
      await fs.mkdir(dir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('App already exists')
      }
      throw err
    }

    await fs.mkdir(resolveContentPath(dir, 'canvases'))

    const app: AppConfig = {
      id,
      name,
      style: {},
      layouts: [DEFAULT_LAYOUT],
    }
    if (pathMeta.value !== undefined) {
      app.path = pathMeta.value
    }

    await writeAppFile(app)
    await writeCanvasesFile(dir, { canvases: [] })
    return app
  }

  async function setAppStyle(
    id: string,
    patch: { light?: string | null; dark?: string | null },
  ): Promise<AppConfig> {
    const hasLight = 'light' in patch && patch.light !== undefined
    const hasDark = 'dark' in patch && patch.dark !== undefined
    if (!hasLight && !hasDark) {
      throw new Error('style patch requires light and/or dark')
    }
    const app = await readAppFile(id)
    const next = { ...app.style }
    if ('light' in patch && patch.light !== undefined) {
      const light = patch.light
      if (light === null) {
        delete next.light
      } else {
        const trimmed = light.trim()
        if (!trimmed) {
          throw new Error('light style id is required')
        }
        next.light = trimmed
      }
    }
    if ('dark' in patch && patch.dark !== undefined) {
      const dark = patch.dark
      if (dark === null) {
        delete next.dark
      } else {
        const trimmed = dark.trim()
        if (!trimmed) {
          throw new Error('dark style id is required')
        }
        next.dark = trimmed
      }
    }
    app.style = next
    await writeAppFile(app)
    return app
  }

  async function removeAppStyle(id: string, slot: StyleSlot): Promise<AppConfig> {
    return setAppStyle(id, { [slot]: null })
  }

  async function addAppLayout(id: string, layoutId: string): Promise<AppConfig> {
    const trimmed = layoutId.trim()
    if (!trimmed) {
      throw new Error('layout id is required')
    }
    const app = await readAppFile(id)
    if (!app.layouts.includes(trimmed)) {
      app.layouts = [...app.layouts, trimmed]
      await writeAppFile(app)
    }
    return app
  }

  async function removeAppLayout(
    id: string,
    layoutId: string,
  ): Promise<AppConfig> {
    const trimmed = layoutId.trim()
    if (!trimmed) {
      throw new Error('layout id is required')
    }
    const app = await readAppFile(id)
    if (!app.layouts.includes(trimmed)) {
      return app
    }
    if (app.layouts.length <= 1) {
      throw new Error('At least one layout is required')
    }
    app.layouts = app.layouts.filter((item) => item !== trimmed)
    await writeAppFile(app)
    return app
  }

  async function deleteApp(id: string): Promise<void> {
    if (!isValidAppId(id)) {
      throw new Error(`Invalid app id: ${id}`)
    }
    await getApp(id)
    await fs.rm(appDir(id), { recursive: true })
  }

  async function listCanvases(appId: string): Promise<CanvasEntry[]> {
    await getApp(appId)
    const data = await readCanvasesFile(appDir(appId))
    return data.canvases
  }

  async function addCanvas(
    appId: string,
    input: { id: string; name: string },
  ): Promise<CanvasEntry> {
    await getApp(appId)
    if (!isValidAppId(input.id)) {
      throw new Error(`Invalid canvas id: ${input.id}`)
    }
    const name = requireNonEmptyName(input.name, 'Canvas name')

    const dir = appDir(appId)
    const data = await readCanvasesFile(dir)
    const component = nameToComponentFile(name, input.id)

    if (data.canvases.some((c) => c.id === input.id)) {
      throw new Error(`Canvas already exists: ${input.id}`)
    }
    if (data.canvases.some((c) => c.component === component)) {
      throw new Error(`Component already exists: ${component}`)
    }

    const componentPath = resolveContentPath(dir, 'canvases', component)
    try {
      await fs.writeFile(
        componentPath,
        canvasPlaceholderSource(component, name),
        {
          encoding: 'utf8',
          flag: 'wx',
        },
      )
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Component already exists: ${component}`)
      }
      throw err
    }

    const canvas: CanvasEntry = {
      id: input.id,
      name,
      component,
    }
    data.canvases.push(canvas)
    await writeCanvasesFile(dir, data)
    return canvas
  }

  async function deleteCanvas(appId: string, canvasId: string): Promise<void> {
    await getApp(appId)
    const dir = appDir(appId)
    const data = await readCanvasesFile(dir)
    const idx = data.canvases.findIndex((c) => c.id === canvasId)
    if (idx === -1) {
      throw new Error(`Canvas not found: ${canvasId}`)
    }
    const [removed] = data.canvases.splice(idx, 1)
    await writeCanvasesFile(dir, data)
    const componentPath = resolveContentPath(dir, 'canvases', removed.component)
    await fs.rm(componentPath, { force: true })
  }

  async function renameCanvas(
    appId: string,
    canvasId: string,
    input: { id: string; name: string },
  ): Promise<CanvasEntry> {
    await getApp(appId)
    if (!isValidAppId(input.id)) {
      throw new Error(`Invalid canvas id: ${input.id}`)
    }
    const name = requireNonEmptyName(input.name, 'Canvas name')
    const dir = appDir(appId)
    const data = await readCanvasesFile(dir)
    const idx = data.canvases.findIndex((c) => c.id === canvasId)
    if (idx === -1) {
      throw new Error(`Canvas not found: ${canvasId}`)
    }
    const current = data.canvases[idx]
    const component = nameToComponentFile(name, input.id)

    if (
      current.id === input.id &&
      current.name === name &&
      current.component === component
    ) {
      return current
    }

    if (
      data.canvases.some((c, i) => i !== idx && c.id === input.id)
    ) {
      throw new Error(`Canvas already exists: ${input.id}`)
    }
    if (
      data.canvases.some((c, i) => i !== idx && c.component === component)
    ) {
      throw new Error(`Component already exists: ${component}`)
    }

    const fromPath = resolveContentPath(dir, 'canvases', current.component)
    const toPath = resolveContentPath(dir, 'canvases', component)
    let renamedFile = false
    if (current.component !== component) {
      await fs.rename(fromPath, toPath)
      renamedFile = true
    }

    const updated: CanvasEntry = { id: input.id, name, component }
    data.canvases[idx] = updated
    try {
      await writeCanvasesFile(dir, data)
    } catch (err) {
      if (renamedFile) {
        try {
          await fs.rename(toPath, fromPath)
        } catch {
          // best-effort rollback; rethrow original
        }
      }
      throw err
    }
    return updated
  }

  return {
    listApps,
    getApp,
    createApp,
    deleteApp,
    setAppStyle,
    removeAppStyle,
    addAppLayout,
    removeAppLayout,
    listCanvases,
    addCanvas,
    deleteCanvas,
    renameCanvas,
  }
}

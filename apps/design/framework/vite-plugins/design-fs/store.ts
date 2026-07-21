import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  type AppConfig,
  type CanvasEntry,
  type CanvasesFile,
} from '../../src/lib/types'
import { isValidAppId } from '../../src/lib/slug'
import { validatePathMeta } from '../../src/lib/pathMeta'
import { resolveContentPath } from './paths'

const TS_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function toPascalCase(value: string): string {
  return value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
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
  canvasName: string,
): string {
  const fn = componentFile.replace(/\.tsx$/, '')
  return `export default function ${fn}() {\n  return <h1>${canvasName}</h1>\n}\n`
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

  async function getApp(id: string): Promise<AppConfig> {
    if (!isValidAppId(id)) {
      throw new Error(`Invalid app id: ${id}`)
    }
    const file = resolveContentPath(root, id, 'app.json')
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as AppConfig
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
        const appJson = resolveContentPath(root, entry, 'app.json')
        const raw = await fs.readFile(appJson, 'utf8')
        apps.push(JSON.parse(raw) as AppConfig)
      } catch {
        // skip dirs without valid app.json / invalid entry ids
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
      style: DEFAULT_STYLE,
      layout: DEFAULT_LAYOUT,
    }
    if (pathMeta.value !== undefined) {
      app.path = pathMeta.value
    }

    await fs.writeFile(
      resolveContentPath(dir, 'app.json'),
      `${JSON.stringify(app, null, 2)}\n`,
      'utf8',
    )
    await writeCanvasesFile(dir, { canvases: [] })
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

  return {
    listApps,
    getApp,
    createApp,
    deleteApp,
    listCanvases,
    addCanvas,
    deleteCanvas,
  }
}

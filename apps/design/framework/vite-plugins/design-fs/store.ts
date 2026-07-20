import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  type AppConfig,
  type PageEntry,
  type PagesFile,
} from '../../src/lib/types'
import { isValidAppId } from '../../src/lib/slug'
import { validatePathMeta } from '../../src/lib/pathMeta'
import { resolveContentPath } from './paths'

export function nameToComponentFile(name: string, id: string): string {
  const fromName = name
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  const base =
    fromName ||
    id
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  return `${base}.tsx`
}

export function pagePlaceholderSource(componentFile: string): string {
  const fn = componentFile.replace(/\.tsx$/, '')
  return `export default function ${fn}() {\n  return <h1>${fn}</h1>\n}\n`
}

async function readPagesFile(appDir: string): Promise<PagesFile> {
  const pagesPath = resolveContentPath(appDir, 'pages.json')
  const raw = await fs.readFile(pagesPath, 'utf8')
  return JSON.parse(raw) as PagesFile
}

async function writePagesFile(appDir: string, data: PagesFile): Promise<void> {
  const pagesPath = resolveContentPath(appDir, 'pages.json')
  await fs.writeFile(pagesPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
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
      const appJson = path.join(root, entry, 'app.json')
      try {
        const raw = await fs.readFile(appJson, 'utf8')
        apps.push(JSON.parse(raw) as AppConfig)
      } catch {
        // skip dirs without valid app.json
      }
    }
    return apps
  }

  async function createApp(input: {
    id: string
    name: string
    path?: string
  }): Promise<AppConfig> {
    const { id, name } = input
    if (!isValidAppId(id)) {
      throw new Error(`Invalid app id: ${id}`)
    }
    const pathMeta = validatePathMeta(input.path)
    if (!pathMeta.ok) {
      throw new Error(pathMeta.error)
    }

    const dir = appDir(id)
    try {
      await fs.access(dir)
      throw new Error('App already exists')
    } catch (err) {
      if ((err as Error).message === 'App already exists') throw err
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    await fs.mkdir(resolveContentPath(dir, 'pages'), { recursive: true })

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
    await writePagesFile(dir, { pages: [] })
    return app
  }

  async function deleteApp(id: string): Promise<void> {
    if (!isValidAppId(id)) {
      throw new Error(`Invalid app id: ${id}`)
    }
    await fs.rm(appDir(id), { recursive: true, force: true })
  }

  async function listPages(appId: string): Promise<PageEntry[]> {
    await getApp(appId)
    const data = await readPagesFile(appDir(appId))
    return data.pages
  }

  async function addPage(
    appId: string,
    input: { id: string; name: string },
  ): Promise<PageEntry> {
    await getApp(appId)
    if (!isValidAppId(input.id)) {
      throw new Error(`Invalid page id: ${input.id}`)
    }

    const dir = appDir(appId)
    const data = await readPagesFile(dir)
    const component = nameToComponentFile(input.name, input.id)

    if (data.pages.some((p) => p.id === input.id)) {
      throw new Error(`Page already exists: ${input.id}`)
    }
    if (data.pages.some((p) => p.component === component)) {
      throw new Error(`Component already exists: ${component}`)
    }

    const componentPath = resolveContentPath(dir, 'pages', component)
    try {
      await fs.access(componentPath)
      throw new Error(`Component already exists: ${component}`)
    } catch (err) {
      if ((err as Error).message.startsWith('Component already exists')) throw err
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    await fs.writeFile(componentPath, pagePlaceholderSource(component), 'utf8')

    const page: PageEntry = {
      id: input.id,
      name: input.name,
      component,
    }
    data.pages.push(page)
    await writePagesFile(dir, data)
    return page
  }

  async function deletePage(appId: string, pageId: string): Promise<void> {
    await getApp(appId)
    const dir = appDir(appId)
    const data = await readPagesFile(dir)
    const idx = data.pages.findIndex((p) => p.id === pageId)
    if (idx === -1) {
      throw new Error(`Page not found: ${pageId}`)
    }
    const [removed] = data.pages.splice(idx, 1)
    await writePagesFile(dir, data)
    const componentPath = resolveContentPath(dir, 'pages', removed.component)
    await fs.rm(componentPath, { force: true })
  }

  return {
    listApps,
    getApp,
    createApp,
    deleteApp,
    listPages,
    addPage,
    deletePage,
  }
}

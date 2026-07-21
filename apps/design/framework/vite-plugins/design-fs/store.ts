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

export function pagePlaceholderSource(
  componentFile: string,
  pageName: string,
): string {
  const fn = componentFile.replace(/\.tsx$/, '')
  return `export default function ${fn}() {\n  return <h1>${pageName}</h1>\n}\n`
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

    await fs.mkdir(resolveContentPath(dir, 'pages'))

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
    await getApp(id)
    await fs.rm(appDir(id), { recursive: true })
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
    const name = requireNonEmptyName(input.name, 'Page name')

    const dir = appDir(appId)
    const data = await readPagesFile(dir)
    const component = nameToComponentFile(name, input.id)

    if (data.pages.some((p) => p.id === input.id)) {
      throw new Error(`Page already exists: ${input.id}`)
    }
    if (data.pages.some((p) => p.component === component)) {
      throw new Error(`Component already exists: ${component}`)
    }

    const componentPath = resolveContentPath(dir, 'pages', component)
    try {
      await fs.writeFile(componentPath, pagePlaceholderSource(component, name), {
        encoding: 'utf8',
        flag: 'wx',
      })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Component already exists: ${component}`)
      }
      throw err
    }

    const page: PageEntry = {
      id: input.id,
      name,
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

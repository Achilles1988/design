import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContentStore, normalizeAppConfig } from './store'

describe('normalizeAppConfig', () => {
  it('migrates legacy layout string to layouts array', () => {
    expect(
      normalizeAppConfig({
        id: 'orders',
        name: 'Orders',
        style: 'dashboard',
        layout: 'split-screen',
      }),
    ).toEqual({
      id: 'orders',
      name: 'Orders',
      style: 'dashboard',
      layouts: ['split-screen'],
    })
  })

  it('filters invalid layouts entries and defaults when empty', () => {
    expect(
      normalizeAppConfig({
        id: 'orders',
        name: 'Orders',
        layouts: ['sidebar-shell', '', 3, 'split-screen'],
      }),
    ).toMatchObject({
      style: 'dashboard',
      layouts: ['sidebar-shell', 'split-screen'],
    })

    expect(
      normalizeAppConfig({
        id: 'orders',
        name: 'Orders',
        layouts: [],
      }).layouts,
    ).toEqual(['sidebar-shell'])
  })
})

describe('createContentStore', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-store-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates app with defaults and empty canvases', async () => {
    const store = createContentStore(root)
    const app = await store.createApp({ id: 'orders', name: 'Orders' })
    expect(app).toMatchObject({
      id: 'orders',
      name: 'Orders',
      style: 'dashboard',
      layouts: ['sidebar-shell'],
    })
    const raw = await fs.readFile(path.join(root, 'orders', 'app.json'), 'utf8')
    expect(JSON.parse(raw)).toMatchObject({
      id: 'orders',
      layouts: ['sidebar-shell'],
    })
    expect(JSON.parse(raw).layout).toBeUndefined()
    const canvases = JSON.parse(
      await fs.readFile(path.join(root, 'orders', 'canvases.json'), 'utf8'),
    )
    expect(canvases.canvases).toEqual([])
  })

  it('normalizes a legacy layout in memory without writing during read', async () => {
    const store = createContentStore(root)
    await fs.mkdir(path.join(root, 'legacy'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'legacy', 'app.json'),
      `${JSON.stringify({
        id: 'legacy',
        name: 'Legacy',
        style: 'dashboard',
        layout: 'split-screen',
      }, null, 2)}\n`,
      'utf8',
    )
    await fs.writeFile(
      path.join(root, 'legacy', 'canvases.json'),
      `${JSON.stringify({ canvases: [] }, null, 2)}\n`,
      'utf8',
    )

    const appPath = path.join(root, 'legacy', 'app.json')
    const before = await fs.readFile(appPath, 'utf8')
    const app = await store.getApp('legacy')
    expect(app.layouts).toEqual(['split-screen'])
    expect(await fs.readFile(appPath, 'utf8')).toBe(before)
  })

  it('replaces style and appends layouts on apply', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })

    const afterStyle = await store.setAppStyle('orders', 'totality')
    expect(afterStyle.style).toBe('totality')

    const afterLayout = await store.addAppLayout('orders', 'split-screen')
    expect(afterLayout.layouts).toEqual(['sidebar-shell', 'split-screen'])

    const again = await store.addAppLayout('orders', 'split-screen')
    expect(again.layouts).toEqual(['sidebar-shell', 'split-screen'])
  })

  it('removes layouts but keeps at least one', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    await store.addAppLayout('orders', 'split-screen')

    const afterRemove = await store.removeAppLayout('orders', 'split-screen')
    expect(afterRemove.layouts).toEqual(['sidebar-shell'])

    await expect(
      store.removeAppLayout('orders', 'sidebar-shell'),
    ).rejects.toThrow(/At least one layout is required/)
  })

  it('rejects blank app names', async () => {
    const store = createContentStore(root)
    await expect(
      store.createApp({ id: 'orders', name: '   ' }),
    ).rejects.toThrow(/App name is required/)
  })

  it('rejects duplicate id', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    await expect(
      store.createApp({ id: 'orders', name: 'Orders 2' }),
    ).rejects.toThrow(/exists/)
  })

  it('adds and deletes blank canvases on disk', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    const canvas = await store.addCanvas('orders', { id: 'home', name: 'Home' })
    expect(canvas.component).toBe('Home.tsx')
    const file = path.join(root, 'orders', 'canvases', 'Home.tsx')
    await expect(fs.access(file)).resolves.toBeUndefined()
    expect(await fs.readFile(file, 'utf8')).toBe(
      'export default function Home() {\n  return null\n}\n',
    )
    await store.deleteCanvas('orders', 'home')
    await expect(fs.access(file)).rejects.toThrow()
  })

  it('creates a visually blank Canvas component', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'alpha', name: 'Alpha' })
    const canvas = await store.addCanvas('alpha', {
      id: 'reports',
      name: 'Reports',
    })

    const source = await fs.readFile(
      path.join(root, 'alpha', 'canvases', canvas.component),
      'utf8',
    )

    expect(source).toBe(
      'export default function Reports() {\n  return null\n}\n',
    )
    expect(source).not.toContain('<h1>')
  })

  it('falls back to id when canvas name yields illegal TS identifier', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    const canvas = await store.addCanvas('orders', {
      id: 'not-found',
      name: '404 Canvas',
    })
    expect(canvas.component).toBe('NotFound.tsx')
    const source = await fs.readFile(
      path.join(root, 'orders', 'canvases', 'NotFound.tsx'),
      'utf8',
    )
    expect(source).toContain('function NotFound(')
    expect(source).not.toContain('function 404')
    expect(source).toBe(
      'export default function NotFound() {\n  return null\n}\n',
    )
  })
})

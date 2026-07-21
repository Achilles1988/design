import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createContentStore } from './store'

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
      layout: 'sidebar-shell',
    })
    const raw = await fs.readFile(path.join(root, 'orders', 'app.json'), 'utf8')
    expect(JSON.parse(raw).id).toBe('orders')
    const canvases = JSON.parse(
      await fs.readFile(path.join(root, 'orders', 'canvases.json'), 'utf8'),
    )
    expect(canvases.canvases).toEqual([])
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
    expect(await fs.readFile(file, 'utf8')).toContain('<h1>Home</h1>')
    await store.deleteCanvas('orders', 'home')
    await expect(fs.access(file)).rejects.toThrow()
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
    expect(source).toContain('<h1>404 Canvas</h1>')
  })
})

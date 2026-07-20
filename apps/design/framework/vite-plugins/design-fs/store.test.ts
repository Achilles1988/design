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

  it('creates app with defaults and empty pages', async () => {
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
    const pages = JSON.parse(
      await fs.readFile(path.join(root, 'orders', 'pages.json'), 'utf8'),
    )
    expect(pages.pages).toEqual([])
  })

  it('rejects duplicate id', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    await expect(
      store.createApp({ id: 'orders', name: 'Orders 2' }),
    ).rejects.toThrow(/exists/)
  })

  it('adds and deletes blank pages on disk', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    const page = await store.addPage('orders', { id: 'home', name: 'Home' })
    expect(page.component).toBe('Home.tsx')
    const file = path.join(root, 'orders', 'pages', 'Home.tsx')
    await expect(fs.access(file)).resolves.toBeUndefined()
    await store.deletePage('orders', 'home')
    await expect(fs.access(file)).rejects.toThrow()
  })

  it('falls back to id when page name yields illegal TS identifier', async () => {
    const store = createContentStore(root)
    await store.createApp({ id: 'orders', name: 'Orders' })
    const page = await store.addPage('orders', {
      id: 'not-found',
      name: '404 Page',
    })
    expect(page.component).toBe('NotFound.tsx')
    const source = await fs.readFile(
      path.join(root, 'orders', 'pages', 'NotFound.tsx'),
      'utf8',
    )
    expect(source).toContain('function NotFound(')
    expect(source).not.toContain('function 404')
  })
})

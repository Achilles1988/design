import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAssetsStore } from './assets'
import { createStoredZip, zipDirectory } from './zip'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

async function makeTemp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'design-assets-'))
  temps.push(dir)
  return dir
}

describe('createStoredZip', () => {
  it('embeds file names and payloads', () => {
    const zip = createStoredZip([
      { name: 'a.txt', data: Buffer.from('hello') },
      { name: 'dir/b.txt', data: Buffer.from('world') },
    ])
    expect(zip.includes(Buffer.from('a.txt'))).toBe(true)
    expect(zip.includes(Buffer.from('dir/b.txt'))).toBe(true)
    expect(zip.includes(Buffer.from('hello'))).toBe(true)
    expect(zip.includes(Buffer.from('world'))).toBe(true)
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
  })
})

describe('createAssetsStore', () => {
  it('lists packages that have the expected preview file', async () => {
    const root = await makeTemp()
    await fs.mkdir(path.join(root, 'designmd', 'alpha'), { recursive: true })
    await fs.mkdir(path.join(root, 'designmd', 'beta'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'designmd', 'alpha', 'components.html'),
      '<html></html>',
    )
    await fs.writeFile(path.join(root, 'designmd', 'beta', 'DESIGN.md'), 'x')

    const store = createAssetsStore(root)
    const list = await store.listAssets('designmd')
    expect(list).toEqual([
      {
        id: 'alpha',
        name: 'alpha',
        previewUrl: '/assets/designmd/alpha/components.html',
        slots: ['light', 'dark'],
      },
    ])
  })

  it('attaches supported slots from DESIGN.md tags for designmd', async () => {
    const root = await makeTemp()
    async function pkg(id: string, tags: string[]) {
      const dir = path.join(root, 'designmd', id)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'components.html'), '<html></html>')
      const tagLines = tags.map((t) => `- ${t}`).join('\n')
      await fs.writeFile(
        path.join(dir, 'DESIGN.md'),
        `---\ntags:\n${tagLines}\n---\n# ${id}\n`,
      )
    }
    await pkg('sunny', ['light'])
    await pkg('midnight', ['dark'])
    await pkg('dual', ['light', 'dark'])
    await pkg('untagged', ['brand'])

    const list = await createAssetsStore(root).listAssets('designmd')
    expect(list).toEqual([
      {
        id: 'dual',
        name: 'dual',
        previewUrl: '/assets/designmd/dual/components.html',
        slots: ['light', 'dark'],
      },
      {
        id: 'midnight',
        name: 'midnight',
        previewUrl: '/assets/designmd/midnight/components.html',
        slots: ['dark'],
      },
      {
        id: 'sunny',
        name: 'sunny',
        previewUrl: '/assets/designmd/sunny/components.html',
        slots: ['light'],
      },
      {
        id: 'untagged',
        name: 'untagged',
        previewUrl: '/assets/designmd/untagged/components.html',
        slots: ['light', 'dark'],
      },
    ])
  })

  it('does not attach slots for layoutmd', async () => {
    const root = await makeTemp()
    const dir = path.join(root, 'layoutmd', 'shell')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'preview.html'), '<html></html>')
    const list = await createAssetsStore(root).listAssets('layoutmd')
    expect(list).toEqual([
      {
        id: 'shell',
        name: 'shell',
        previewUrl: '/assets/layoutmd/shell/preview.html',
      },
    ])
  })

  it('zips a package directory', async () => {
    const root = await makeTemp()
    const pkg = path.join(root, 'layoutmd', 'shell')
    await fs.mkdir(pkg, { recursive: true })
    await fs.writeFile(path.join(pkg, 'preview.html'), '<html>p</html>')
    await fs.writeFile(path.join(pkg, 'LAYOUT.md'), '# layout')

    const zip = await zipDirectory(pkg)
    expect(zip.includes(Buffer.from('preview.html'))).toBe(true)
    expect(zip.includes(Buffer.from('LAYOUT.md'))).toBe(true)

    const store = createAssetsStore(root)
    const downloaded = await store.downloadPackage('layoutmd', 'shell')
    expect(downloaded.equals(zip)).toBe(true)
  })

  it('rejects missing packages', async () => {
    const root = await makeTemp()
    const store = createAssetsStore(root)
    await expect(store.downloadPackage('designmd', 'missing')).rejects.toThrow(
      /not found/i,
    )
  })

  it('asserts stock packages exist with contract files', async () => {
    const root = await makeTemp()
    const pkg = path.join(root, 'designmd', 'totality')
    await fs.mkdir(pkg, { recursive: true })
    await fs.writeFile(path.join(pkg, 'components.html'), '<html></html>')
    await fs.writeFile(path.join(pkg, 'DESIGN.md'), '# Totality')

    const store = createAssetsStore(root)
    const dir = await store.assertPackageDir('designmd', 'totality')
    expect(dir).toBe(path.join(root, 'designmd', 'totality'))
    await expect(store.assertPackageDir('designmd', 'missing')).rejects.toThrow(
      /not found/i,
    )
  })

  it('rejects style packages without DESIGN.md', async () => {
    const root = await makeTemp()
    const pkg = path.join(root, 'designmd', 'bare')
    await fs.mkdir(pkg, { recursive: true })
    await fs.writeFile(path.join(pkg, 'components.html'), '<html></html>')

    const store = createAssetsStore(root)
    await expect(store.assertPackageDir('designmd', 'bare')).rejects.toThrow(
      /Style contract missing/i,
    )
  })

  it('rejects layout packages without LAYOUT.md', async () => {
    const root = await makeTemp()
    const pkg = path.join(root, 'layoutmd', 'bare')
    await fs.mkdir(pkg, { recursive: true })
    await fs.writeFile(path.join(pkg, 'preview.html'), '<html></html>')

    const store = createAssetsStore(root)
    await expect(store.assertPackageDir('layoutmd', 'bare')).rejects.toThrow(
      /Layout contract missing/i,
    )
  })
})

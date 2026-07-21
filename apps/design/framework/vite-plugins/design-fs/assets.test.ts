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

  it('installs designmd into stylesRoot and normalizes design.md', async () => {
    const root = await makeTemp()
    const stylesRoot = path.join(root, 'styles')
    const layoutsRoot = path.join(root, 'layouts')
    const assetsRoot = path.join(root, 'assets')
    const pkg = path.join(assetsRoot, 'designmd', 'totality')
    await fs.mkdir(pkg, { recursive: true })
    await fs.writeFile(path.join(pkg, 'components.html'), '<html></html>')
    await fs.writeFile(path.join(pkg, 'DESIGN.md'), '# Totality')

    const store = createAssetsStore(assetsRoot, { stylesRoot, layoutsRoot })
    const result = await store.installPackage('designmd', 'totality')
    expect(result.targetDir).toBe(path.join(stylesRoot, 'totality'))
    expect(await fs.readFile(path.join(stylesRoot, 'totality', 'design.md'), 'utf8')).toBe(
      '# Totality',
    )
    expect(await fs.readFile(path.join(stylesRoot, 'totality', 'components.html'), 'utf8')).toBe(
      '<html></html>',
    )
  })

  it('installs layoutmd into layoutsRoot', async () => {
    const root = await makeTemp()
    const stylesRoot = path.join(root, 'styles')
    const layoutsRoot = path.join(root, 'layouts')
    const assetsRoot = path.join(root, 'assets')
    const pkg = path.join(assetsRoot, 'layoutmd', 'split-screen')
    await fs.mkdir(pkg, { recursive: true })
    await fs.writeFile(path.join(pkg, 'preview.html'), '<html>p</html>')
    await fs.writeFile(path.join(pkg, 'LAYOUT.md'), '# layout')

    const store = createAssetsStore(assetsRoot, { stylesRoot, layoutsRoot })
    const result = await store.installPackage('layoutmd', 'split-screen')
    expect(result.targetDir).toBe(path.join(layoutsRoot, 'split-screen'))
    expect(await fs.readFile(path.join(layoutsRoot, 'split-screen', 'LAYOUT.md'), 'utf8')).toBe(
      '# layout',
    )
  })
})

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCanvasContextLoader } from './context'

const temporaryRoots: string[] = []

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-context-'))
  temporaryRoots.push(root)

  const contentRoot = path.join(root, 'apps')
  const appDir = path.join(contentRoot, 'shop')
  const canvasesDir = path.join(appDir, 'canvases')
  const componentsDir = path.join(appDir, 'components')
  const stylesRoot = path.join(root, 'styles')
  const layoutsRoot = path.join(root, 'layouts')

  await Promise.all([
    fs.mkdir(canvasesDir, { recursive: true }),
    fs.mkdir(componentsDir, { recursive: true }),
    fs.mkdir(path.join(stylesRoot, 'studio'), { recursive: true }),
    fs.mkdir(path.join(layoutsRoot, 'sidebar'), { recursive: true }),
    fs.mkdir(path.join(layoutsRoot, 'uninstalled'), { recursive: true }),
  ])

  await Promise.all([
    writeJson(path.join(appDir, 'app.json'), {
      id: 'shop',
      name: 'Shop',
      style: 'studio',
      layouts: ['sidebar'],
    }),
    writeJson(path.join(appDir, 'canvases.json'), {
      canvases: [
        { id: 'home', name: 'Home', component: 'Home.tsx' },
        { id: 'other', name: 'Other', component: 'Other.tsx' },
      ],
    }),
    fs.writeFile(
      path.join(canvasesDir, 'Home.tsx'),
      "import './Home.css'\nexport default function Home() { return null }\n",
      'utf8',
    ),
    fs.writeFile(path.join(canvasesDir, 'Home.css'), '.home { color: red; }\n'),
    fs.writeFile(
      path.join(canvasesDir, 'Other.tsx'),
      'export default function Other() { return null }\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(componentsDir, 'Select.tsx'),
      'export function Select() { return null }\n',
      'utf8',
    ),
    fs.writeFile(path.join(componentsDir, 'ignored.svg'), '<svg />\n', 'utf8'),
    fs.writeFile(
      path.join(stylesRoot, 'studio', 'DESIGN.md'),
      '# Studio Style\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(layoutsRoot, 'sidebar', 'LAYOUT.md'),
      '# Sidebar Layout\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(layoutsRoot, 'uninstalled', 'LAYOUT.md'),
      '# Uninstalled Layout\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(layoutsRoot, 'INDEX.md'),
      [
        '| dir | title | summary | tags | origin | preview |',
        '| --- | --- | --- | --- | --- | --- |',
        '| `sidebar` | Sidebar | Persistent navigation | shell, nav | core | Y |',
        '| `split` | Split | Two panes | workspace | core | N |',
        '',
      ].join('\n'),
      'utf8',
    ),
  ])

  return {
    root,
    contentRoot,
    appDir,
    canvasesDir,
    componentsDir,
    stylesRoot,
    layoutsRoot,
    loader: createCanvasContextLoader({
      contentRoot,
      stylesRoot,
      layoutsRoot,
    }),
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  )
})

describe('createCanvasContextLoader', () => {
  it('loads only the current Canvas, its direct local CSS, and App components', async () => {
    const fixture = await createFixture()

    const context = await fixture.loader.load('shop', 'home')

    expect(
      context.files.map((file) => [file.relativePath, file.permission]),
    ).toEqual([
      ['canvases/Home.css', 'write-existing'],
      ['canvases/Home.tsx', 'write-existing'],
      ['components/Select.tsx', 'read-only'],
    ])
    expect(context.files.every((file) => file.hash.length === 64)).toBe(true)
    expect(context.componentsDir).toBe(fixture.componentsDir)
  })

  it('does not read another Canvas', async () => {
    const fixture = await createFixture()

    const context = await fixture.loader.load('shop', 'home')

    expect(
      context.files.some((file) => file.relativePath.includes('Other.tsx')),
    ).toBe(false)
    expect(context.files.map((file) => file.source).join('\n')).not.toContain(
      'function Other',
    )

    const escapedFixture = await createFixture()
    await fs.writeFile(
      path.join(escapedFixture.appDir, 'Other.tsx'),
      'export default function Other() { return null }\n',
      'utf8',
    )
    await writeJson(path.join(escapedFixture.appDir, 'canvases.json'), {
      canvases: [
        { id: 'home', name: 'Home', component: '../Other.tsx' },
      ],
    })
    await expect(
      escapedFixture.loader.load('shop', 'home'),
    ).rejects.toThrow('Canvas source could not be loaded.')
  })

  it('rejects a Canvas CSS path outside the canvases directory', async () => {
    const fixture = await createFixture()
    await fs.writeFile(
      path.join(fixture.appDir, 'outside.css'),
      '.outside {}\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(fixture.canvasesDir, 'Home.tsx'),
      "import '../outside.css'\nexport default function Home() { return null }\n",
      'utf8',
    )

    await expect(fixture.loader.load('shop', 'home')).rejects.toThrow(
      'Canvas source could not be loaded.',
    )

    const symlinkFixture = await createFixture()
    const externalCss = path.join(symlinkFixture.appDir, 'external.css')
    await fs.writeFile(externalCss, '.external {}\n', 'utf8')
    await fs.symlink(
      externalCss,
      path.join(symlinkFixture.canvasesDir, 'Linked.css'),
    )
    await fs.writeFile(
      path.join(symlinkFixture.canvasesDir, 'Home.tsx'),
      "import './Linked.css'\nexport default function Home() { return null }\n",
      'utf8',
    )
    await expect(
      symlinkFixture.loader.load('shop', 'home'),
    ).rejects.toThrow('Canvas source could not be loaded.')
  })

  it('marks existing shared components read-only', async () => {
    const fixture = await createFixture()
    const context = await fixture.loader.load('shop', 'home')

    expect(
      context.files.find(
        (file) => file.relativePath === 'components/Select.tsx',
      )?.permission,
    ).toBe('read-only')
    expect(() =>
      fixture.loader.validateCandidatePath(
        context,
        'components/Select.tsx',
        'write-existing',
      ),
    ).toThrow()
  })

  it('allows a new TSX or CSS path only below the App components directory', async () => {
    const fixture = await createFixture()
    const context = await fixture.loader.load('shop', 'home')

    expect(
      fixture.loader.validateCandidatePath(
        context,
        'components/forms/Field.tsx',
        'create-shared',
      ),
    ).toBe('create-shared')
    expect(
      fixture.loader.validateCandidatePath(
        context,
        'components/forms/Field.css',
        'create-shared',
      ),
    ).toBe('create-shared')
    expect(() =>
      fixture.loader.validateCandidatePath(
        context,
        'components/forms/Field.ts',
        'create-shared',
      ),
    ).toThrow()
    expect(() =>
      fixture.loader.validateCandidatePath(
        context,
        'canvases/New.tsx',
        'create-shared',
      ),
    ).toThrow()
    expect(() =>
      fixture.loader.validateCandidatePath(
        context,
        'components/Select.tsx',
        'create-shared',
      ),
    ).toThrow()

    const outsideDir = path.join(fixture.root, 'outside-components')
    await fs.mkdir(outsideDir)
    await fs.symlink(
      outsideDir,
      path.join(fixture.componentsDir, 'outside'),
    )
    expect(() =>
      fixture.loader.validateCandidatePath(
        context,
        'components/outside/New.tsx',
        'create-shared',
      ),
    ).toThrow()
  })

  it('loads DESIGN.md for the configured Style', async () => {
    const fixture = await createFixture()

    const context = await fixture.loader.load('shop', 'home')

    expect(context.style).toEqual({
      id: 'studio',
      relativePath: 'studio/DESIGN.md',
      source: '# Studio Style\n',
    })

    await fs.rename(
      path.join(fixture.stylesRoot, 'studio', 'DESIGN.md'),
      path.join(fixture.stylesRoot, 'studio', 'design.md'),
    )
    const lowercaseContext = await fixture.loader.load('shop', 'home')
    expect(lowercaseContext.style.relativePath).toBe('studio/design.md')
  })

  it('fails when the mandatory Style contract is missing', async () => {
    const fixture = await createFixture()
    await fs.rm(path.join(fixture.stylesRoot, 'studio', 'DESIGN.md'))

    await expect(fixture.loader.load('shop', 'home')).rejects.toThrow(
      'The configured Style contract could not be loaded.',
    )
  })

  it('loads only installed LAYOUT.md contracts', async () => {
    const fixture = await createFixture()
    await writeJson(path.join(fixture.appDir, 'app.json'), {
      id: 'shop',
      name: 'Shop',
      style: 'studio',
      layouts: ['sidebar', 'missing'],
    })

    const context = await fixture.loader.load('shop', 'home')

    expect(context.installedLayouts).toEqual([
      {
        id: 'sidebar',
        relativePath: 'sidebar/LAYOUT.md',
        source: '# Sidebar Layout\n',
      },
    ])
  })

  it('parses the layout asset INDEX.md for recommendations', async () => {
    const fixture = await createFixture()

    const context = await fixture.loader.load('shop', 'home')

    expect(context.layoutIndex).toEqual([
      {
        id: 'sidebar',
        title: 'Sidebar',
        summary: 'Persistent navigation',
        tags: ['shell', 'nav'],
        origin: 'core',
        hasPreview: true,
      },
      {
        id: 'split',
        title: 'Split',
        summary: 'Two panes',
        tags: ['workspace'],
        origin: 'core',
        hasPreview: false,
      },
    ])
  })
})

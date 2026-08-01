import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppStyleSlots } from '../../src/lib/styleSlots'
import {
  createCanvasContextLoader,
  validateCandidatePath,
} from './context'

const temporaryRoots: string[] = []

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function createFixture(
  style: AppStyleSlots = { light: 'studio', dark: 'midnight' },
) {
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
    fs.mkdir(path.join(stylesRoot, 'midnight'), { recursive: true }),
    fs.mkdir(path.join(layoutsRoot, 'sidebar'), { recursive: true }),
    fs.mkdir(path.join(layoutsRoot, 'uninstalled'), { recursive: true }),
  ])

  await Promise.all([
    writeJson(path.join(appDir, 'app.json'), {
      id: 'shop',
      name: 'Shop',
      style,
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
      path.join(stylesRoot, 'midnight', 'DESIGN.md'),
      '# Midnight Style\n',
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
  it('loads App tokens.css when a Canvas imports ../tokens.css', async () => {
    const fixture = await createFixture()
    await fs.writeFile(
      path.join(fixture.appDir, 'tokens.css'),
      '[data-theme="light"] { --color-primary: #000; }',
      'utf8',
    )
    await fs.writeFile(
      path.join(fixture.canvasesDir, 'Home.tsx'),
      "import '../tokens.css'\nimport './Home.css'\nexport default function Home() { return null }\n",
      'utf8',
    )

    const context = await fixture.loader.load('shop', 'home')

    expect(
      context.files.map((file) => [file.relativePath, file.permission]),
    ).toEqual([
      ['canvases/Home.css', 'write-existing'],
      ['canvases/Home.tsx', 'write-existing'],
      ['components/Select.tsx', 'read-only'],
      ['tokens.css', 'read-only'],
    ])
  })

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
    expect(context.appConfigHash).toHaveLength(64)
    expect(context.styles.light?.hash).toHaveLength(64)
    expect(context.installedLayouts).toHaveLength(1)
    expect(context.installedLayouts[0]?.hash).toHaveLength(64)
    expect(context.componentsDir).toBe(fixture.componentsDir)
  })

  it('fingerprints the exact current app.json bytes', async () => {
    const fixture = await createFixture()
    const appConfigPath = path.join(fixture.appDir, 'app.json')
    const first = await fixture.loader.load('shop', 'home')
    const source = await fs.readFile(appConfigPath, 'utf8')
    await fs.writeFile(appConfigPath, `${source}\n`, 'utf8')

    const second = await fixture.loader.load('shop', 'home')

    expect(second.app).toEqual(first.app)
    expect(second.appConfigHash).not.toBe(first.appConfigHash)
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

  it('rejects aliased, nested, or non-TSX Canvas sources', async () => {
    const aliasedFixture = await createFixture()
    await writeJson(path.join(aliasedFixture.appDir, 'canvases.json'), {
      canvases: [
        { id: 'home', name: 'Home', component: 'Other.tsx' },
        { id: 'other', name: 'Other', component: 'Other.tsx' },
      ],
    })
    await expect(
      aliasedFixture.loader.load('shop', 'home'),
    ).rejects.toThrow('Canvas source could not be loaded.')

    const nestedFixture = await createFixture()
    const nestedDir = path.join(nestedFixture.canvasesDir, 'nested')
    await fs.mkdir(nestedDir)
    await fs.writeFile(
      path.join(nestedDir, 'Home.tsx'),
      'export default function Home() { return null }\n',
      'utf8',
    )
    await writeJson(path.join(nestedFixture.appDir, 'canvases.json'), {
      canvases: [
        { id: 'home', name: 'Home', component: 'nested/Home.tsx' },
      ],
    })
    await expect(
      nestedFixture.loader.load('shop', 'home'),
    ).rejects.toThrow('Canvas source could not be loaded.')

    const nonTsxFixture = await createFixture()
    await fs.writeFile(
      path.join(nonTsxFixture.canvasesDir, 'Home.ts'),
      'export default function Home() { return null }\n',
      'utf8',
    )
    await writeJson(path.join(nonTsxFixture.appDir, 'canvases.json'), {
      canvases: [
        { id: 'home', name: 'Home', component: 'Home.ts' },
      ],
    })
    await expect(
      nonTsxFixture.loader.load('shop', 'home'),
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

  it('rejects writable Canvas CSS symlinks to another Canvas source', async () => {
    const fixture = await createFixture()
    await fs.symlink(
      path.join(fixture.canvasesDir, 'Other.tsx'),
      path.join(fixture.canvasesDir, 'Linked.css'),
    )
    await fs.writeFile(
      path.join(fixture.canvasesDir, 'Home.tsx'),
      "import './Linked.css'\nexport default function Home() { return null }\n",
      'utf8',
    )

    await expect(fixture.loader.load('shop', 'home')).rejects.toThrow(
      'Canvas source could not be loaded.',
    )
  })

  it('ignores package CSS and rejects nested or sibling-directory Canvas CSS discovery', async () => {
    const bareFixture = await createFixture()
    await fs.writeFile(
      path.join(bareFixture.canvasesDir, 'Home.tsx'),
      "import 'Home.css'\nexport default function Home() { return null }\n",
      'utf8',
    )
    const bareContext = await bareFixture.loader.load('shop', 'home')
    expect(
      bareContext.files.map((file) => file.relativePath),
    ).not.toContain('canvases/Home.css')

    const nestedFixture = await createFixture()
    const nestedCssDir = path.join(nestedFixture.canvasesDir, 'nested')
    await fs.mkdir(nestedCssDir)
    await fs.writeFile(
      path.join(nestedCssDir, 'Nested.css'),
      '.nested {}\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(nestedFixture.canvasesDir, 'Home.tsx'),
      "import './nested/Nested.css'\nexport default function Home() { return null }\n",
      'utf8',
    )
    await expect(
      nestedFixture.loader.load('shop', 'home'),
    ).rejects.toThrow('Canvas source could not be loaded.')

    const siblingFixture = await createFixture()
    const siblingDir = path.join(siblingFixture.appDir, 'styles')
    await fs.mkdir(siblingDir)
    await fs.writeFile(
      path.join(siblingDir, 'Sibling.css'),
      '.sibling {}\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(siblingFixture.canvasesDir, 'Home.tsx'),
      "import '../styles/Sibling.css'\nexport default function Home() { return null }\n",
      'utf8',
    )
    await expect(
      siblingFixture.loader.load('shop', 'home'),
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

  it('rejects symlinked App components roots', async () => {
    const canvasesAlias = await createFixture()
    await fs.rm(canvasesAlias.componentsDir, { recursive: true })
    await fs.symlink(canvasesAlias.canvasesDir, canvasesAlias.componentsDir)

    const aliasedContext = await canvasesAlias.loader.load('shop', 'home')

    expect(
      aliasedContext.files.some(
        (file) => file.relativePath === 'components/Other.tsx',
      ),
    ).toBe(false)
    expect(() =>
      canvasesAlias.loader.validateCandidatePath(
        aliasedContext,
        'components/New.tsx',
        'create-shared',
      ),
    ).toThrow()

    const outsideAlias = await createFixture()
    const outsideDir = path.join(outsideAlias.root, 'outside-root')
    await fs.mkdir(outsideDir)
    await fs.rm(outsideAlias.componentsDir, { recursive: true })
    await fs.symlink(outsideDir, outsideAlias.componentsDir)

    const outsideContext = await outsideAlias.loader.load('shop', 'home')

    expect(() =>
      outsideAlias.loader.validateCandidatePath(
        outsideContext,
        'components/New.tsx',
        'create-shared',
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

  it('exports the same candidate path boundary used by the loader', async () => {
    const fixture = await createFixture()
    const context = await fixture.loader.load('shop', 'home')

    expect(
      validateCandidatePath(
        context,
        'canvases/Home.tsx',
        'write-existing',
      ),
    ).toBe(
      fixture.loader.validateCandidatePath(
        context,
        'canvases/Home.tsx',
        'write-existing',
      ),
    )
    expect(() =>
      validateCandidatePath(
        context,
        'components/Select.tsx',
        'write-existing',
      ),
    ).toThrow()
  })

  it('rejects a dangling symlink at a candidate path', async () => {
    const fixture = await createFixture()
    const context = await fixture.loader.load('shop', 'home')
    await fs.symlink(
      path.join(fixture.componentsDir, 'Missing.tsx'),
      path.join(fixture.componentsDir, 'Dangling.tsx'),
    )

    expect(() =>
      fixture.loader.validateCandidatePath(
        context,
        'components/Dangling.tsx',
        'create-shared',
      ),
    ).toThrow()
  })

  it('loads DESIGN.md for every configured Style slot', async () => {
    const fixture = await createFixture()

    const context = await fixture.loader.load('shop', 'home')

    expect(context.styles).toEqual({
      light: {
        id: 'studio',
        relativePath: 'studio/DESIGN.md',
        source: '# Studio Style\n',
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      dark: {
        id: 'midnight',
        relativePath: 'midnight/DESIGN.md',
        source: '# Midnight Style\n',
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    })

    await fs.rename(
      path.join(fixture.stylesRoot, 'studio', 'DESIGN.md'),
      path.join(fixture.stylesRoot, 'studio', 'design.md'),
    )
    const lowercaseContext = await fixture.loader.load('shop', 'home')
    expect(lowercaseContext.styles.light?.relativePath).toBe(
      'studio/design.md',
    )
  })

  it('loads only the configured slot when one slot is empty', async () => {
    const fixture = await createFixture({ dark: 'midnight' })

    const context = await fixture.loader.load('shop', 'home')

    expect(context.styles.light).toBeUndefined()
    expect(context.styles.dark?.id).toBe('midnight')
  })

  it('fails when a configured Style contract is missing', async () => {
    const lightFixture = await createFixture()
    await fs.rm(path.join(lightFixture.stylesRoot, 'studio', 'DESIGN.md'))

    await expect(lightFixture.loader.load('shop', 'home')).rejects.toThrow(
      'The configured light Style contract could not be loaded.',
    )

    const darkFixture = await createFixture()
    await fs.rm(path.join(darkFixture.stylesRoot, 'midnight', 'DESIGN.md'))

    await expect(darkFixture.loader.load('shop', 'home')).rejects.toThrow(
      'The configured dark Style contract could not be loaded.',
    )
  })

  it('fails when no Style slot is configured', async () => {
    const fixture = await createFixture({})

    await expect(fixture.loader.load('shop', 'home')).rejects.toThrow(
      'No Style is configured for this App.',
    )
  })

  it('loads only installed LAYOUT.md contracts', async () => {
    const fixture = await createFixture()
    await writeJson(path.join(fixture.appDir, 'app.json'), {
      id: 'shop',
      name: 'Shop',
      style: { light: 'studio' },
      layouts: ['sidebar', 'missing'],
    })

    const context = await fixture.loader.load('shop', 'home')

    expect(context.installedLayouts).toEqual([
      {
        id: 'sidebar',
        relativePath: 'sidebar/LAYOUT.md',
        source: '# Sidebar Layout\n',
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
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

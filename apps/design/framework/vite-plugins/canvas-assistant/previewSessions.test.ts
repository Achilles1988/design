import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createCanvasPreviewSessionStore,
  createCanvasPreviewTargetLoader,
} from './previewSessions'

describe('Canvas preview sessions', () => {
  let root: string
  let contentRoot: string
  let appDir: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-session-'))
    contentRoot = path.join(root, 'apps')
    appDir = path.join(contentRoot, 'design')
    await Promise.all([
      fs.mkdir(path.join(appDir, 'canvases'), { recursive: true }),
      fs.mkdir(path.join(appDir, 'components/nested'), {
        recursive: true,
      }),
      fs.mkdir(path.join(root, 'outside'), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(
        path.join(appDir, 'app.json'),
        JSON.stringify({
          id: 'design',
          name: 'Design',
          style: 'dashboard',
          layouts: ['sidebar-shell'],
        }),
      ),
      fs.writeFile(
        path.join(appDir, 'canvases.json'),
        JSON.stringify({
          canvases: [
            {
              id: 'home',
              name: 'Home',
              component: 'Home.tsx',
            },
            {
              id: 'other',
              name: 'Other',
              component: 'Other.tsx',
            },
          ],
        }),
      ),
      fs.writeFile(
        path.join(appDir, 'canvases/Home.tsx'),
        "import './Home.css'\nexport default function Home() { return null }",
      ),
      fs.writeFile(path.join(appDir, 'canvases/Home.css'), '.home {}'),
      fs.writeFile(
        path.join(appDir, 'canvases/Other.tsx'),
        'export default function Other() { return null }',
      ),
      fs.writeFile(
        path.join(appDir, 'components/Button.tsx'),
        'export function Button() { return null }',
      ),
      fs.writeFile(
        path.join(appDir, 'components/nested/Card.ts'),
        'export const Card = true',
      ),
      fs.writeFile(
        path.join(appDir, 'components/private.json'),
        '{"secret":true}',
      ),
      fs.writeFile(
        path.join(root, 'outside/Leaked.tsx'),
        'export const leaked = true',
      ),
    ])
    await fs.symlink(
      path.join(root, 'outside/Leaked.tsx'),
      path.join(appDir, 'components/Leaked.tsx'),
    )
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('derives an exact current-Canvas and real component allowlist from disk', async () => {
    const load = createCanvasPreviewTargetLoader({ contentRoot })

    const target = await load({
      appId: 'design',
      canvasId: 'home',
    })

    expect(target.componentFile).toBe('Home.tsx')
    expect(target.canvasModulePaths).toEqual([
      '/apps/design/canvases/Home.tsx',
      '/apps/design/canvases/Home.css',
    ])
    expect(target.componentModulePaths).toEqual([
      '/apps/design/components/Button.tsx',
      '/apps/design/components/nested/Card.ts',
    ])
    expect(
      target.guardedModuleFiles.map((entry) => entry.modulePath),
    ).toEqual([
      '/apps/design/canvases/Home.css',
      '/apps/design/canvases/Home.tsx',
      '/apps/design/components/Button.tsx',
      '/apps/design/components/nested/Card.ts',
    ])
  })

  it('authorizes only issued, unexpired, normalized module paths', async () => {
    let now = 100
    const store = createCanvasPreviewSessionStore({
      now: () => now,
      createToken: () =>
        '00000000-0000-4000-8000-000000000001',
      ttlMs: 10,
    })
    const session = store.issue(
      await createCanvasPreviewTargetLoader({ contentRoot })({
        appId: 'design',
        canvasId: 'home',
      }),
    )
    expect(session.expiresAt).toBe('1970-01-01T00:00:00.110Z')
    const token = session.moduleBase.split('/').at(-2) ?? ''

    expect(
      await store.authorize(
        token,
        '/framework/src/preview/canvasPreviewFrame.tsx',
      ),
    ).toBe(true)
    expect(
      await store.authorize(
        token,
        '/apps/design/canvases/Home.tsx',
      ),
    ).toBe(true)
    expect(
      await store.authorize(
        token,
        '/apps/design/components/Button.tsx',
      ),
    ).toBe(true)
    expect(
      await store.authorize(
        token,
        '/apps/design/canvases/Other.tsx',
      ),
    ).toBe(false)
    expect(
      await store.authorize(
        token,
        '/apps/design/components/private.json',
      ),
    ).toBe(false)
    expect(
      await store.authorize(
        token,
        '/apps/design/components/%252e%252e/canvases/Other.tsx',
      ),
    ).toBe(false)
    now = 110
    expect(
      await store.authorize(
        token,
        '/apps/design/canvases/Home.tsx',
      ),
    ).toBe(false)
  })

  it('rejects a canvases directory symlinked outside the App', async () => {
    const externalCanvases = path.join(root, 'external-canvases')
    await fs.mkdir(externalCanvases)
    await fs.writeFile(
      path.join(externalCanvases, 'Home.tsx'),
      'export default function Home() { return null }',
    )
    await fs.rm(path.join(appDir, 'canvases'), {
      recursive: true,
      force: true,
    })
    await fs.symlink(
      externalCanvases,
      path.join(appDir, 'canvases'),
    )

    const load = createCanvasPreviewTargetLoader({ contentRoot })

    await expect(
      load({ appId: 'design', canvasId: 'home' }),
    ).rejects.toThrow('outside the App')
  })

  it('rejects a current Canvas entry symlinked to another Canvas', async () => {
    await fs.rm(path.join(appDir, 'canvases/Home.tsx'))
    await fs.symlink(
      'Other.tsx',
      path.join(appDir, 'canvases/Home.tsx'),
    )
    const load = createCanvasPreviewTargetLoader({ contentRoot })

    await expect(
      load({ appId: 'design', canvasId: 'home' }),
    ).rejects.toThrow('regular file')
  })

  it('revokes an issued module after its file becomes a symlink', async () => {
    const load = createCanvasPreviewTargetLoader({ contentRoot })
    const store = createCanvasPreviewSessionStore({
      createToken: () =>
        '00000000-0000-4000-8000-000000000001',
    })
    const session = store.issue(
      await load({ appId: 'design', canvasId: 'home' }),
    )
    const token = session.moduleBase.split('/').at(-2) ?? ''
    const modulePath = '/apps/design/canvases/Home.tsx'

    expect(await store.authorize(token, modulePath)).toBe(true)

    await fs.rm(path.join(appDir, 'canvases/Home.tsx'))
    await fs.symlink(
      'Other.tsx',
      path.join(appDir, 'canvases/Home.tsx'),
    )

    expect(await store.authorize(token, modulePath)).toBe(false)
  })
})

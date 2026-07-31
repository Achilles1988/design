import fs from 'node:fs/promises'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { designFsPlugin, rewriteCanvasSpaUrl } from './plugin'

describe('rewriteCanvasSpaUrl', () => {
  it('rewrites HTML navigations to extension-less canvas routes', () => {
    expect(
      rewriteCanvasSpaUrl(
        '/apps/smoke/canvases/landing',
        'text/html,application/xhtml+xml',
      ),
    ).toBe('/index.html')
    expect(
      rewriteCanvasSpaUrl('/apps/smoke/canvases/home/', 'text/html'),
    ).toBe('/index.html')
  })

  it('leaves module and non-HTML requests alone', () => {
    expect(
      rewriteCanvasSpaUrl(
        '/apps/smoke/canvases/Landing.tsx',
        'text/html,application/xhtml+xml',
      ),
    ).toBeNull()
    expect(
      rewriteCanvasSpaUrl('/apps/smoke/canvases/landing', '*/*'),
    ).toBeNull()
    expect(
      rewriteCanvasSpaUrl('/apps/smoke', 'text/html'),
    ).toBeNull()
  })
})


type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>

const temporaryRoots: string[] = []
const servers: Array<ReturnType<typeof createServer>> = []

async function startHarness(): Promise<{
  baseUrl: string
  contentRoot: string
  assetsRoot: string
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'design-fs-origin-'))
  temporaryRoots.push(root)
  const contentRoot = path.join(root, 'apps')
  const assetsRoot = path.join(root, 'assets')
  await Promise.all([
    fs.mkdir(contentRoot, { recursive: true }),
    fs.mkdir(assetsRoot, { recursive: true }),
  ])

  let middleware: Middleware | undefined
  const plugin = designFsPlugin({ contentRoot, assetsRoot })
  plugin.configureServer?.({
    middlewares: {
      use(handler: Middleware) {
        middleware = handler
      },
    },
  } as unknown as ViteDevServer)
  if (!middleware) throw new Error('design-fs middleware was not mounted.')

  const server = createServer((req, res) => {
    void Promise.resolve(
      middleware?.(req, res, () => {
        res.statusCode = 599
        res.end('next')
      }),
    ).catch((error) => {
      res.statusCode = 500
      res.end(error instanceof Error ? error.message : String(error))
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', resolve),
  )
  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    contentRoot,
    assetsRoot,
  }
}

async function createStylePackage(
  assetsRoot: string,
  id: string,
  tags: string[],
): Promise<void> {
  const dir = path.join(assetsRoot, 'designmd', id)
  await fs.mkdir(dir, { recursive: true })
  const tagLines = tags.map((tag) => `- ${tag}`).join('\n')
  await fs.writeFile(
    path.join(dir, 'DESIGN.md'),
    `---\ntags:\n${tagLines}\n---\n# ${id}\n`,
    'utf8',
  )
}

function request(
  baseUrl: string,
  input: {
    method: string
    path: string
    origin: string
    body?: unknown
  },
): Promise<{ status: number; body: string }> {
  const body =
    input.body === undefined ? undefined : JSON.stringify(input.body)
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      `${baseUrl}${input.path}`,
      {
        method: input.method,
        headers: {
          Connection: 'close',
          Origin: input.origin,
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(1_000, () => {
      req.destroy(
        new Error(
          `Timed out waiting for ${input.method} ${input.path}`,
        ),
      )
    })
    if (body) req.write(body)
    req.end()
  })
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => {
        server.closeAllConnections()
        return new Promise<void>((resolve) =>
          server.close(() => resolve()),
        )
      },
    ),
  )
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  )
})

describe('designFsPlugin mutation origin boundary', () => {
  it('rejects opaque-origin writes and deletes while same-origin Shell operations work', async () => {
    const { baseUrl, contentRoot } = await startHarness()

    const created = await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: baseUrl,
      body: { id: 'victim', name: 'Victim' },
    })
    expect(created.status).toBe(200)
    const legacyAppPath = path.join(contentRoot, 'victim', 'app.json')
    const legacySource = `${JSON.stringify(
      {
        id: 'victim',
        name: 'Victim',
        style: { dark: 'dashboard' },
        layout: 'sidebar-shell',
      },
      null,
      2,
    )}\n`
    await fs.writeFile(legacyAppPath, legacySource, 'utf8')

    const opaqueRead = await request(baseUrl, {
      method: 'GET',
      path: '/__design_fs/apps/victim',
      origin: 'null',
    })
    expect(opaqueRead.status).toBe(403)
    expect(await fs.readFile(legacyAppPath, 'utf8')).toBe(legacySource)

    const opaqueCreate = await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: 'null',
      body: { id: 'intruder', name: 'Intruder' },
    })
    expect(opaqueCreate.status).toBe(403)
    await expect(
      fs.access(path.join(contentRoot, 'intruder')),
    ).rejects.toThrow()

    const opaqueDelete = await request(baseUrl, {
      method: 'DELETE',
      path: '/__design_fs/apps/victim',
      origin: 'null',
    })
    expect(opaqueDelete.status).toBe(403)
    await expect(
      fs.access(legacyAppPath),
    ).resolves.toBeUndefined()

    const shellDelete = await request(baseUrl, {
      method: 'DELETE',
      path: '/__design_fs/apps/victim',
      origin: baseUrl,
    })
    expect(shellDelete.status).toBe(200)
  })
})

describe('designFsPlugin style apply + delete', () => {
  it('applies with no slot on a light-only style, writing style.light', async () => {
    const { baseUrl, assetsRoot } = await startHarness()
    await createStylePackage(assetsRoot, 'sunny', ['light'])
    await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: baseUrl,
      body: { id: 'a', name: 'A' },
    })

    const res = await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/assets/designmd/sunny/apply',
      origin: baseUrl,
      body: { appId: 'a' },
    })

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body).style).toEqual({ light: 'sunny' })
  })

  it('returns 409 needsSlot for a both-polarity style with no slot', async () => {
    const { baseUrl, assetsRoot } = await startHarness()
    await createStylePackage(assetsRoot, 'dual', ['spec'])
    await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: baseUrl,
      body: { id: 'a', name: 'A' },
    })

    const res = await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/assets/designmd/dual/apply',
      origin: baseUrl,
      body: { appId: 'a' },
    })

    expect(res.status).toBe(409)
    const body = JSON.parse(res.body) as {
      error: string
      needsSlot: boolean
      options: string[]
    }
    expect(body.needsSlot).toBe(true)
    expect(body.options).toEqual(['light', 'dark', 'both'])
    expect(typeof body.error).toBe('string')
  })

  it('applies with slot dark on a dark-polarity style, writing style.dark', async () => {
    const { baseUrl, assetsRoot } = await startHarness()
    await createStylePackage(assetsRoot, 'midnight', ['dark'])
    await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: baseUrl,
      body: { id: 'a', name: 'A' },
    })

    const res = await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/assets/designmd/midnight/apply',
      origin: baseUrl,
      body: { appId: 'a', slot: 'dark' },
    })

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body).style).toEqual({ dark: 'midnight' })
  })

  it('rejects slot light on a dark-polarity style with 400', async () => {
    const { baseUrl, assetsRoot } = await startHarness()
    await createStylePackage(assetsRoot, 'midnight', ['dark'])
    await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: baseUrl,
      body: { id: 'a', name: 'A' },
    })

    const res = await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/assets/designmd/midnight/apply',
      origin: baseUrl,
      body: { appId: 'a', slot: 'light' },
    })

    expect(res.status).toBe(400)
  })

  it('applies with slot both on a both-polarity style, setting both ids', async () => {
    const { baseUrl, assetsRoot } = await startHarness()
    await createStylePackage(assetsRoot, 'dual', ['spec'])
    await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: baseUrl,
      body: { id: 'a', name: 'A' },
    })

    const res = await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/assets/designmd/dual/apply',
      origin: baseUrl,
      body: { appId: 'a', slot: 'both' },
    })

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body).style).toEqual({
      light: 'dual',
      dark: 'dual',
    })
  })

  it('DELETE /apps/:id/style/light clears the light slot', async () => {
    const { baseUrl, assetsRoot } = await startHarness()
    await createStylePackage(assetsRoot, 'dual', ['spec'])
    await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/apps',
      origin: baseUrl,
      body: { id: 'a', name: 'A' },
    })
    await request(baseUrl, {
      method: 'POST',
      path: '/__design_fs/assets/designmd/dual/apply',
      origin: baseUrl,
      body: { appId: 'a', slot: 'both' },
    })

    const res = await request(baseUrl, {
      method: 'DELETE',
      path: '/__design_fs/apps/a/style/light',
      origin: baseUrl,
    })

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body).style).toEqual({ dark: 'dual' })
  })
})

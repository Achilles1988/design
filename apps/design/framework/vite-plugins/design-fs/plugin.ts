import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createAssetsStore, isAssetKind } from './assets'
import { createContentStore } from './store'

const DESIGN_FS_NOT_FOUND = 'Not found'
const DESIGN_FS_FORBIDDEN =
  'design-fs requires a same-origin Shell request'

function forwardedProto(req: IncomingMessage): string {
  const value = req.headers['x-forwarded-proto']
  const first = Array.isArray(value) ? value[0] : value
  return first?.split(',')[0]?.trim() || 'http'
}

function isCrossSiteBrowserRequest(req: IncomingMessage): boolean {
  const fetchSite = req.headers['sec-fetch-site']
  const site = Array.isArray(fetchSite) ? fetchSite[0] : fetchSite
  return req.headers.origin === 'null' || site === 'cross-site'
}

function isSameOrigin(req: IncomingMessage): boolean {
  const host = req.headers.host
  return (
    typeof host === 'string' &&
    req.headers.origin === `${forwardedProto(req)}://${host}`
  )
}

function canAccessDesignFs(
  req: IncomingMessage,
  method: string,
): boolean {
  if (isCrossSiteBrowserRequest(req)) return false
  if (method === 'GET' || method === 'HEAD') return true
  return isSameOrigin(req)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

function statusForError(err: unknown): number {
  const code = (err as NodeJS.ErrnoException).code
  const msg = err instanceof Error ? err.message : String(err)
  if (code === 'ENOENT' || /not found/i.test(msg)) return 404
  if (/already exists/i.test(msg)) return 409
  if (
    /invalid|must not|must be|path escapes|expected|required/i.test(msg)
  ) {
    return 400
  }
  return 500
}

function sanitizeErrorMessage(err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code
  const message = err instanceof Error ? err.message : String(err)
  if (code === 'ENOENT') {
    return DESIGN_FS_NOT_FOUND
  }
  return message
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function sendBinary(
  res: ServerResponse,
  status: number,
  body: Buffer,
  headers: Record<string, string>,
): void {
  res.statusCode = status
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
  res.end(body)
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req)
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('Invalid JSON body')
  }
}

export function designFsPlugin(options: {
  contentRoot: string
  assetsRoot: string
}): Plugin {
  const store = createContentStore(options.contentRoot)
  const assets = createAssetsStore(options.assetsRoot)
  return {
    name: 'design-fs',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith('/__design_fs')) return next()

        try {
          const pathname = new URL(rawUrl, 'http://localhost').pathname
          const method = (req.method ?? 'GET').toUpperCase()
          if (!canAccessDesignFs(req, method)) {
            sendJson(res, 403, { error: DESIGN_FS_FORBIDDEN })
            return
          }
          const parts = pathname.split('/').filter(Boolean)
          // parts: ['__design_fs', ...]
          if (parts[0] !== '__design_fs') {
            sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
            return
          }

          // GET /__design_fs/assets/:kind
          // GET /__design_fs/assets/:kind/:id/download
          // POST /__design_fs/assets/:kind/:id/apply  { appId }
          if (parts[1] === 'assets') {
            const kind = parts[2]
            if (!kind || !isAssetKind(kind)) {
              sendJson(res, 400, {
                error: 'kind must be designmd or layoutmd',
              })
              return
            }

            if (parts.length === 3 && method === 'GET') {
              sendJson(res, 200, await assets.listAssets(kind))
              return
            }

            if (
              parts.length === 5 &&
              parts[4] === 'download' &&
              method === 'GET'
            ) {
              const id = decodeURIComponent(parts[3] ?? '')
              if (!id) {
                sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
                return
              }
              const zip = await assets.downloadPackage(kind, id)
              sendBinary(res, 200, zip, {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${id}.zip"`,
              })
              return
            }

            if (
              parts.length === 5 &&
              parts[4] === 'apply' &&
              method === 'POST'
            ) {
              const id = decodeURIComponent(parts[3] ?? '')
              if (!id) {
                sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
                return
              }
              const body = (await parseJsonBody(req)) as { appId?: string }
              if (typeof body.appId !== 'string' || !body.appId.trim()) {
                sendJson(res, 400, { error: 'appId is required' })
                return
              }
              const appId = body.appId.trim()
              // Validate stock package + target App before writing app.json.
              await assets.assertPackageDir(kind, id)
              await store.getApp(appId)
              const app =
                kind === 'designmd'
                  ? await store.setAppStyle(appId, id)
                  : await store.addAppLayout(appId, id)
              sendJson(res, 200, app)
              return
            }

            sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
            return
          }

          if (parts[1] !== 'apps') {
            sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
            return
          }

          // GET /__design_fs/apps
          if (parts.length === 2 && method === 'GET') {
            sendJson(res, 200, await store.listApps())
            return
          }

          // POST /__design_fs/apps
          if (parts.length === 2 && method === 'POST') {
            const body = (await parseJsonBody(req)) as {
              id?: string
              name?: string
              path?: unknown
            }
            if (typeof body.id !== 'string' || typeof body.name !== 'string') {
              sendJson(res, 400, { error: 'id and name are required' })
              return
            }
            if (body.path !== undefined && typeof body.path !== 'string') {
              sendJson(res, 400, { error: 'path must be a string' })
              return
            }
            const app = await store.createApp({
              id: body.id,
              name: body.name,
              path: body.path,
            })
            sendJson(res, 200, app)
            return
          }

          const appId = parts[2]
          if (!appId) {
            sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
            return
          }

          // GET /__design_fs/apps/:id
          if (parts.length === 3 && method === 'GET') {
            sendJson(res, 200, await store.getApp(appId))
            return
          }

          // DELETE /__design_fs/apps/:id
          if (parts.length === 3 && method === 'DELETE') {
            await store.deleteApp(appId)
            sendJson(res, 200, { ok: true })
            return
          }

          // DELETE /__design_fs/apps/:id/layouts/:layoutId
          if (
            parts.length === 5 &&
            parts[3] === 'layouts' &&
            method === 'DELETE'
          ) {
            const layoutId = decodeURIComponent(parts[4] ?? '')
            if (!layoutId) {
              sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
              return
            }
            sendJson(res, 200, await store.removeAppLayout(appId, layoutId))
            return
          }

          // /__design_fs/apps/:id/canvases[...]
          if (parts[3] !== 'canvases') {
            sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
            return
          }

          // GET /__design_fs/apps/:id/canvases
          if (parts.length === 4 && method === 'GET') {
            sendJson(res, 200, await store.listCanvases(appId))
            return
          }

          // POST /__design_fs/apps/:id/canvases
          if (parts.length === 4 && method === 'POST') {
            const body = (await parseJsonBody(req)) as {
              id?: string
              name?: string
            }
            if (typeof body.id !== 'string' || typeof body.name !== 'string') {
              sendJson(res, 400, { error: 'id and name are required' })
              return
            }
            const canvas = await store.addCanvas(appId, {
              id: body.id,
              name: body.name,
            })
            sendJson(res, 200, canvas)
            return
          }

          // DELETE /__design_fs/apps/:id/canvases/:canvasId
          if (parts.length === 5 && method === 'DELETE') {
            const canvasId = parts[4]
            await store.deleteCanvas(appId, canvasId)
            sendJson(res, 200, { ok: true })
            return
          }

          // POST /__design_fs/apps/:id/canvases/:canvasId/rename
          if (
            parts.length === 6 &&
            parts[5] === 'rename' &&
            method === 'POST'
          ) {
            const canvasId = parts[4]
            const body = (await parseJsonBody(req)) as {
              id?: string
              name?: string
            }
            if (typeof body.id !== 'string' || typeof body.name !== 'string') {
              sendJson(res, 400, { error: 'id and name are required' })
              return
            }
            const canvas = await store.renameCanvas(appId, canvasId, {
              id: body.id,
              name: body.name,
            })
            sendJson(res, 200, canvas)
            return
          }

          sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
        } catch (err) {
          const status = statusForError(err)
          const message = sanitizeErrorMessage(err)
          sendJson(res, status, { error: message })
        }
      })
    },
  }
}

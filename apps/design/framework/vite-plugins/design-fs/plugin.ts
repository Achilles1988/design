import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createContentStore } from './store'

const DESIGN_FS_NOT_FOUND = 'Not found'

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

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req)
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('Invalid JSON body')
  }
}

export function designFsPlugin(options: { contentRoot: string }): Plugin {
  const store = createContentStore(options.contentRoot)
  return {
    name: 'design-fs',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith('/__design_fs')) return next()

        try {
          const pathname = new URL(rawUrl, 'http://localhost').pathname
          const method = (req.method ?? 'GET').toUpperCase()
          const parts = pathname.split('/').filter(Boolean)
          // parts: ['__design_fs', 'apps', ...]
          if (parts[0] !== '__design_fs' || parts[1] !== 'apps') {
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

          // /__design_fs/apps/:id/pages[...]
          if (parts[3] !== 'pages') {
            sendJson(res, 404, { error: DESIGN_FS_NOT_FOUND })
            return
          }

          // GET /__design_fs/apps/:id/pages
          if (parts.length === 4 && method === 'GET') {
            sendJson(res, 200, await store.listPages(appId))
            return
          }

          // POST /__design_fs/apps/:id/pages
          if (parts.length === 4 && method === 'POST') {
            const body = (await parseJsonBody(req)) as {
              id?: string
              name?: string
            }
            if (typeof body.id !== 'string' || typeof body.name !== 'string') {
              sendJson(res, 400, { error: 'id and name are required' })
              return
            }
            const page = await store.addPage(appId, {
              id: body.id,
              name: body.name,
            })
            sendJson(res, 200, page)
            return
          }

          // DELETE /__design_fs/apps/:id/pages/:pageId
          if (parts.length === 5 && method === 'DELETE') {
            const pageId = parts[4]
            await store.deletePage(appId, pageId)
            sendJson(res, 200, { ok: true })
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

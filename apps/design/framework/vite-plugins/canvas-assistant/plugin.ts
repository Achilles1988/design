import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import {
  CanvasApplyEventSchema,
  CanvasApplyRequestSchema,
  CanvasChatRequestSchema,
  CanvasContextRequestSchema,
  CanvasPreviewSessionRequestSchema,
  CanvasRunEventSchema,
} from '../../src/lib/canvasAssistantProtocol'
import { createCanvasContextLoader } from './context'
import { createCanvasModelRunner } from './model'
import {
  createProposalStore,
  PROPOSAL_TTL_MS,
} from './proposals'
import {
  applyProposalTransaction,
  createCanvasRepair,
  ROLLBACK_INCOMPLETE_ERROR,
  readSource,
  type ApplyResult,
  validateCanvas,
  writeAtomically,
} from './transaction'
import {
  CANVAS_PREVIEW_MODULE_PREFIX,
  createCanvasPreviewSessionStore,
  createCanvasPreviewTargetLoader,
  type CanvasPreviewTarget,
} from './previewSessions'

const API_PREFIX = '/__design_ai'
const CONTEXT_ROUTE = '/__design_ai/canvas/context'
const CHAT_ROUTE = '/__design_ai/canvas/chat'
const PREVIEW_SESSION_ROUTE = '/__design_ai/canvas/preview-session'
const APPLY_ROUTE =
  /^\/__design_ai\/canvas\/proposals\/([^/]+)\/apply$/
const MAX_BODY_BYTES = 512 * 1024
const PREVIEW_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const FORBIDDEN_PREVIEW_QUERY_KEYS = new Set([
  'inline',
  'raw',
  'sharedworker',
  'url',
  'worker',
])

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

type ContextLoader = ReturnType<typeof createCanvasContextLoader>
type ProposalStore = ReturnType<typeof createProposalStore>
type ModelRunner = ReturnType<typeof createCanvasModelRunner>
type PreviewTargetLoader = (
  request: Parameters<
    ReturnType<typeof createCanvasPreviewTargetLoader>
  >[0],
) => Promise<CanvasPreviewTarget>

type CanvasAssistantPluginOverrides = {
  contextLoader?: ContextLoader
  proposalStore?: ProposalStore
  modelRunner?: ModelRunner
  applyProposalTransactionImpl?: typeof applyProposalTransaction
  createCanvasRepairImpl?: typeof createCanvasRepair
  writeAtomicallyImpl?: typeof writeAtomically
  readSourceImpl?: typeof readSource
  validateCanvasImpl?: typeof validateCanvas
  loadPreviewTargetImpl?: PreviewTargetLoader
  send?: ViteDevServer['ws']['send']
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

function startNdjson(res: ServerResponse): void {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson')
}

function writeNdjson(res: ServerResponse, event: unknown): void {
  res.write(`${JSON.stringify(event)}\n`)
}

function forwardedProto(req: IncomingMessage): string {
  const value = req.headers['x-forwarded-proto']
  const first = Array.isArray(value) ? value[0] : value
  return first?.split(',')[0]?.trim() || 'http'
}

function appendVaryOrigin(res: ServerResponse): void {
  const current = res.getHeader('Vary')
  const values = new Set(
    (Array.isArray(current) ? current.join(',') : String(current ?? ''))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  values.add('Origin')
  res.setHeader('Vary', [...values].join(', '))
}

function isCrossSiteBrowserRequest(req: IncomingMessage): boolean {
  const fetchSite = req.headers['sec-fetch-site']
  const site = Array.isArray(fetchSite) ? fetchSite[0] : fetchSite
  return req.headers.origin === 'null' || site === 'cross-site'
}

function previewModuleRequest(
  pathname: string,
): { token: string; modulePath: string } | null {
  if (!pathname.startsWith(CANVAS_PREVIEW_MODULE_PREFIX)) return null
  const remainder = pathname.slice(CANVAS_PREVIEW_MODULE_PREFIX.length)
  const separator = remainder.indexOf('/')
  if (separator === -1) return null
  const token = remainder.slice(0, separator)
  if (!PREVIEW_TOKEN_PATTERN.test(token)) return null
  return {
    token,
    modulePath: `/${remainder.slice(separator + 1)}`,
  }
}

function headerValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function hasForbiddenPreviewQuery(requestUrl: URL): boolean {
  return [...requestUrl.searchParams.keys()].some((key) =>
    FORBIDDEN_PREVIEW_QUERY_KEYS.has(key.toLowerCase()),
  )
}

function requireSameOrigin(req: IncomingMessage): void {
  const host = req.headers.host
  const origin = req.headers.origin
  if (
    typeof host !== 'string' ||
    typeof origin !== 'string' ||
    origin !== `${forwardedProto(req)}://${host}`
  ) {
    throw new HttpError(403, 'Canvas Assistant requires a same-origin request.')
  }
}

function requireJson(req: IncomingMessage): void {
  const contentType = req.headers['content-type']
  const mediaType = (
    Array.isArray(contentType) ? contentType[0] : contentType
  )
    ?.split(';')[0]
    ?.trim()
    .toLowerCase()
  if (mediaType !== 'application/json') {
    throw new HttpError(
      415,
      'Canvas Assistant requires application/json.',
    )
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false
    const cleanup = () => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('aborted', onAborted)
    }
    const finish = (
      action: (value: string) => void,
      value: string,
    ) => {
      if (settled) return
      settled = true
      cleanup()
      action(value)
    }
    const onData = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        req.pause()
        finish(
          () =>
            reject(
              new HttpError(
                413,
                'Canvas Assistant request body is too large.',
              ),
            ),
          '',
        )
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () =>
      finish(resolve, Buffer.concat(chunks).toString('utf8'))
    const onError = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAborted = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new HttpError(400, 'Canvas Assistant request was aborted.'))
    }
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('error', onError)
    req.once('aborted', onAborted)
  })
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const source = await readBody(req)
  if (!source.trim()) return {}
  try {
    return JSON.parse(source) as unknown
  } catch {
    throw new HttpError(400, 'Canvas Assistant request body is invalid JSON.')
  }
}

function requestAbort(
  req: IncomingMessage,
  res: ServerResponse,
): {
  signal: AbortSignal
  finish: () => void
} {
  const controller = new AbortController()
  let finished = false
  const abort = () => {
    if (!finished) controller.abort()
  }
  const abortIncompleteRequest = () => {
    if (!req.complete) abort()
  }
  const abortIncompleteResponse = () => {
    if (!res.writableEnded) abort()
  }
  req.once('aborted', abort)
  req.once('close', abortIncompleteRequest)
  res.once('close', abortIncompleteResponse)

  return {
    signal: controller.signal,
    finish: () => {
      finished = true
      req.off('aborted', abort)
      req.off('close', abortIncompleteRequest)
      res.off('close', abortIncompleteResponse)
    },
  }
}

function proposalIdFromEvent(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null
  const value = (event as { value?: unknown }).value
  if (!value || typeof value !== 'object') return null
  const content = (value as { content?: unknown }).content
  if (!Array.isArray(content)) return null
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const candidate = part as {
      type?: unknown
      toolName?: unknown
      args?: unknown
    }
    if (
      candidate.type !== 'tool-call' ||
      candidate.toolName !== 'propose_canvas_change' ||
      !candidate.args ||
      typeof candidate.args !== 'object'
    ) {
      continue
    }
    const proposalId = (candidate.args as { proposalId?: unknown })
      .proposalId
    if (typeof proposalId === 'string' && proposalId) return proposalId
  }
  return null
}

function publicError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  const message = error instanceof Error ? error.message : ''
  if (/not found/i.test(message)) {
    return new HttpError(404, 'Canvas Assistant resource was not found.')
  }
  if (/expired|already been claimed/i.test(message)) {
    return new HttpError(
      409,
      'Canvas Assistant proposal is no longer available.',
    )
  }
  return new HttpError(400, 'Canvas Assistant request is invalid.')
}

export function canvasAssistantPlugin(
  options: {
    contentRoot: string
    stylesRoot: string
    layoutsRoot: string
  },
  overrides: CanvasAssistantPluginOverrides = {},
): Plugin {
  const contextLoader =
    overrides.contextLoader ?? createCanvasContextLoader(options)
  const proposalStore =
    overrides.proposalStore ??
    createProposalStore({
      now: Date.now,
      ttlMs: PROPOSAL_TTL_MS,
    })
  const modelRunner =
    overrides.modelRunner ??
    createCanvasModelRunner({
      stageProposal: proposalStore.stage,
    })
  const applyTransaction =
    overrides.applyProposalTransactionImpl ?? applyProposalTransaction
  const makeRepair =
    overrides.createCanvasRepairImpl ?? createCanvasRepair
  const writer = overrides.writeAtomicallyImpl ?? writeAtomically
  const reader = overrides.readSourceImpl ?? readSource
  const validate = overrides.validateCanvasImpl ?? validateCanvas
  const loadPreviewTarget =
    overrides.loadPreviewTargetImpl ??
    createCanvasPreviewTargetLoader({
      contentRoot: options.contentRoot,
    })
  const previewSessions = createCanvasPreviewSessionStore()
  const owners = new Map<
    string,
    { appId: string; canvasId: string }
  >()

  return {
    name: 'canvas-assistant',
    configureServer(server) {
      const send = overrides.send ?? server.ws.send.bind(server.ws)

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        let requestUrl: URL
        try {
          requestUrl = new URL(rawUrl, 'http://localhost')
        } catch {
          return next()
        }
        const pathname = requestUrl.pathname
        const previewRequest = previewModuleRequest(pathname)
        if (pathname.startsWith(CANVAS_PREVIEW_MODULE_PREFIX)) {
          const method = (req.method ?? 'GET').toUpperCase()
          if (
            !previewRequest ||
            req.headers.origin !== 'null' ||
            headerValue(req.headers['sec-fetch-dest']) !== 'script' ||
            (method !== 'GET' && method !== 'HEAD') ||
            hasForbiddenPreviewQuery(requestUrl) ||
            !(await previewSessions.authorize(
              previewRequest.token,
              previewRequest.modulePath,
            ))
          ) {
            sendJson(res, 403, {
              error: 'Canvas preview module capability was rejected.',
            })
            return
          }
          res.setHeader('Access-Control-Allow-Origin', 'null')
          appendVaryOrigin(res)
          req.url = `${previewRequest.modulePath}${requestUrl.search}`
          return next()
        }
        if (req.headers.origin === 'null') {
          sendJson(res, 403, {
            error:
              'Sandboxed previews require a scoped module capability.',
          })
          return
        }
        if (
          pathname.startsWith('/__') &&
          !pathname.startsWith(API_PREFIX) &&
          isCrossSiteBrowserRequest(req)
        ) {
          sendJson(res, 403, {
            error:
              'Sandboxed previews cannot access privileged development routes.',
          })
          return
        }
        if (!pathname.startsWith(API_PREFIX)) return next()

        res.setHeader('Cache-Control', 'no-store')
        const method = (req.method ?? 'GET').toUpperCase()
        const applyMatch = pathname.match(APPLY_ROUTE)
        const knownRoute =
          pathname === CONTEXT_ROUTE ||
          pathname === CHAT_ROUTE ||
          pathname === PREVIEW_SESSION_ROUTE ||
          applyMatch !== null
        if (!knownRoute || method !== 'POST') {
          sendJson(res, 404, {
            error: 'Canvas Assistant route not found.',
          })
          return
        }

        const lifecycle = requestAbort(req, res)
        try {
          requireSameOrigin(req)
          requireJson(req)
          const rawBody = await parseJsonBody(req)

          if (pathname === PREVIEW_SESSION_ROUTE) {
            const request =
              CanvasPreviewSessionRequestSchema.parse(rawBody)
            const target = await loadPreviewTarget(request)
            sendJson(res, 200, previewSessions.issue(target))
            return
          }

          if (pathname === CONTEXT_ROUTE) {
            const request = CanvasContextRequestSchema.parse(rawBody)
            await contextLoader.load(request.appId, request.canvasId)
            sendJson(res, 200, { ready: true })
            return
          }

          if (pathname === CHAT_ROUTE) {
            const request = CanvasChatRequestSchema.parse(rawBody)
            const context = await contextLoader.load(
              request.appId,
              request.canvasId,
            )
            startNdjson(res)
            try {
              for await (const rawEvent of modelRunner.run({
                request,
                context,
                abortSignal: lifecycle.signal,
              })) {
                if (lifecycle.signal.aborted) break
                const event = CanvasRunEventSchema.parse(rawEvent)
                const proposalId = proposalIdFromEvent(event)
                if (proposalId) {
                  owners.set(proposalId, {
                    appId: request.appId,
                    canvasId: request.canvasId,
                  })
                }
                writeNdjson(res, event)
              }
            } catch {
              if (!lifecycle.signal.aborted) {
                writeNdjson(res, {
                  type: 'error',
                  error: 'Canvas Assistant model request failed.',
                })
              }
            }
            if (!res.writableEnded) res.end()
            return
          }

          const request = CanvasApplyRequestSchema.parse(rawBody)
          let proposalId: string
          try {
            proposalId = decodeURIComponent(applyMatch?.[1] ?? '')
          } catch {
            throw new HttpError(
              400,
              'Canvas Assistant proposal id is invalid.',
            )
          }
          const owner = owners.get(proposalId)
          if (!owner) {
            throw new HttpError(
              404,
              'Canvas Assistant proposal was not found.',
            )
          }
          const proposal = proposalStore.claim(
            proposalId,
            owner.appId,
            owner.canvasId,
          )
          startNdjson(res)
          let result: ApplyResult
          try {
            try {
              result = await applyTransaction({
                proposal,
                reloadContext: () =>
                  contextLoader.load(owner.appId, owner.canvasId),
                writeAtomically: writer,
                readSource: reader,
                validate: (targets) => validate(server, targets),
                repair: makeRepair(request.aiConfig),
                onStatus: (status) => {
                  const event = CanvasApplyEventSchema.parse({
                    type: 'status',
                    ...status,
                  })
                  writeNdjson(res, event)
                },
              })
            } catch {
              result = {
                ok: false,
                proposalId,
                error: ROLLBACK_INCOMPLETE_ERROR,
                rolledBack: false,
              }
            }
          } finally {
            proposalStore.complete(proposalId)
          }
          if (result.ok) {
            send({
              type: 'custom',
              event: 'canvas-assistant:applied',
              data: {
                appId: owner.appId,
                canvasId: owner.canvasId,
              },
            })
          }
          writeNdjson(
            res,
            CanvasApplyEventSchema.parse({
              type: 'complete',
              result,
            }),
          )
          res.end()
        } catch (error) {
          if (lifecycle.signal.aborted || res.writableEnded) return
          if (res.headersSent) {
            res.end()
            return
          }
          const safe = publicError(error)
          sendJson(res, safe.status, { error: safe.message })
        } finally {
          lifecycle.finish()
        }
      })
    },
  }
}

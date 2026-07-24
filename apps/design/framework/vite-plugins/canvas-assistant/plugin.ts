import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import {
  CanvasApplyEventSchema,
  CanvasApplyRequestSchema,
  CanvasChatRequestSchema,
  CanvasContextRequestSchema,
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
  type ApplyResult,
  validateCanvas,
  writeAtomically,
} from './transaction'

const API_PREFIX = '/__design_ai'
const CONTEXT_ROUTE = '/__design_ai/canvas/context'
const CHAT_ROUTE = '/__design_ai/canvas/chat'
const APPLY_ROUTE =
  /^\/__design_ai\/canvas\/proposals\/([^/]+)\/apply$/
const MAX_BODY_BYTES = 512 * 1024

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

type CanvasAssistantPluginOverrides = {
  contextLoader?: ContextLoader
  proposalStore?: ProposalStore
  modelRunner?: ModelRunner
  applyProposalTransactionImpl?: typeof applyProposalTransaction
  createCanvasRepairImpl?: typeof createCanvasRepair
  writeAtomicallyImpl?: typeof writeAtomically
  validateCanvasImpl?: typeof validateCanvas
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
  const validate = overrides.validateCanvasImpl ?? validateCanvas
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
        let pathname: string
        try {
          pathname = new URL(rawUrl, 'http://localhost').pathname
        } catch {
          return next()
        }
        if (!pathname.startsWith(API_PREFIX)) return next()

        res.setHeader('Cache-Control', 'no-store')
        const method = (req.method ?? 'GET').toUpperCase()
        const applyMatch = pathname.match(APPLY_ROUTE)
        const knownRoute =
          pathname === CONTEXT_ROUTE ||
          pathname === CHAT_ROUTE ||
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
                validate: (absoluteCanvasPath) =>
                  validate(server, absoluteCanvasPath),
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

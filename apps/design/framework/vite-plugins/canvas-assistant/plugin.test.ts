import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ViteDevServer } from 'vite'
import type {
  CanvasChatRequest,
} from '../../src/lib/canvasAssistantProtocol'
import type { CanvasAuthoringContext } from './context'
import type { StoredProposal } from './proposals'
import type { ApplyStatusEvent } from './transaction'
import { canvasAssistantPlugin } from './plugin'

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>

const API_KEY = 'sk-test-secret'
const CANDIDATE_SOURCE =
  'export default function Home() { return <main>Secret candidate</main> }'
const servers: Array<ReturnType<typeof createServer>> = []

function context(): CanvasAuthoringContext {
  return {
    app: {
      id: 'design',
      name: 'Design',
      style: 'dashboard',
      layouts: ['sidebar-shell'],
    },
    appConfigHash: 'app-config-hash',
    canvas: {
      id: 'home',
      name: 'Home',
      component: 'Home.tsx',
    },
    style: {
      id: 'dashboard',
      relativePath: 'dashboard/DESIGN.md',
      source: '# Dashboard',
      hash: 'style-contract-hash',
    },
    installedLayouts: [
      {
        id: 'sidebar-shell',
        relativePath: 'sidebar-shell/LAYOUT.md',
        source: '# Sidebar Shell',
        hash: 'layout-contract-hash',
      },
    ],
    layoutIndex: [],
    files: [
      {
        relativePath: 'canvases/Home.tsx',
        absolutePath: '/project/design/canvases/Home.tsx',
        source: 'export default function Home() { return null }',
        hash: 'home-hash',
        permission: 'write-existing',
      },
    ],
    componentsDir: '/project/design/components',
  }
}

function proposal(): StoredProposal {
  return {
    id: 'proposal-1',
    appId: 'design',
    canvasId: 'home',
    createdAt: 1,
    expiresAt: 2,
    state: 'applying',
    baseline: [
      {
        path: 'canvases/Home.tsx',
        hash: 'home-hash',
        operation: 'write-existing',
      },
    ],
    candidateFiles: [
      {
        path: 'canvases/Home.tsx',
        source: CANDIDATE_SOURCE,
      },
    ],
    trusted: {
      appConfigHash: 'app-config-hash',
      styleContract: {
        id: 'dashboard',
        hash: 'style-contract-hash',
      },
      selectedLayoutContract: {
        id: 'sidebar-shell',
        hash: 'layout-contract-hash',
      },
      originalUserIntent: 'Build the Canvas.',
      constraints: {
        styleId: 'dashboard',
        layout: {
          kind: 'installed',
          id: 'sidebar-shell',
          reason: 'It fits',
        },
        preserved: ['Navigation'],
      },
    },
    card: {
      proposalId: 'proposal-1',
      mode: 'update',
      summary: ['Update the Canvas'],
      styleId: 'dashboard',
      layout: {
        kind: 'installed',
        id: 'sidebar-shell',
        reason: 'It fits',
      },
      changedFiles: ['canvases/Home.tsx'],
      reusedComponents: [],
      newSharedComponents: [],
      preserved: ['Navigation'],
      validationChecks: ['Vite transform'],
      candidateFiles: [
        {
          path: 'canvases/Home.tsx',
          source: CANDIDATE_SOURCE,
        },
      ],
      expiresAt: '2026-07-24T12:30:00.000Z',
    },
  }
}

function chatBody(): CanvasChatRequest {
  return {
    appId: 'design',
    canvasId: 'home',
    aiConfig: {
      provider: 'openai',
      apiKey: API_KEY,
      model: 'test-model',
    },
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Build the Canvas' }],
      },
    ],
  }
}

function defaultOverrides() {
  const complete = vi.fn()
  const claim = vi.fn(() => proposal())
  const load = vi.fn(async () => context())
  const run = vi.fn(
    async function* (): AsyncGenerator<Record<string, unknown>> {
      yield {
        type: 'run-result',
        value: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      }
    },
  )
  const applyProposalTransactionImpl = vi.fn(
    async (input: {
      onStatus: (event: ApplyStatusEvent) => void
    }) => {
      input.onStatus({ phase: 'checking' })
      input.onStatus({ phase: 'writing' })
      input.onStatus({ phase: 'validating' })
      input.onStatus({
        phase: 'repairing',
        attempt: 1,
      })
      return {
        ok: true as const,
        proposalId: 'proposal-1',
        repairAttempts: 1,
      }
    },
  )
  const createCanvasRepairImpl = vi.fn(() => vi.fn())
  const send = vi.fn()

  return {
    contextLoader: { load },
    proposalStore: {
      stage: vi.fn(),
      claim,
      complete,
    },
    modelRunner: { run },
    applyProposalTransactionImpl,
    createCanvasRepairImpl,
    writeAtomicallyImpl: vi.fn(),
    readSourceImpl: vi.fn(async () => null),
    validateCanvasImpl: vi.fn(),
    send,
  }
}

async function startHarness(
  overrides = defaultOverrides(),
): Promise<{
  baseUrl: string
  origin: string
  overrides: ReturnType<typeof defaultOverrides>
}> {
  let middleware: Middleware | undefined
  const plugin = canvasAssistantPlugin(
    {
      contentRoot: '/project/apps',
      stylesRoot: '/project/styles',
      layoutsRoot: '/project/layouts',
    },
    overrides,
  )
  plugin.configureServer?.({
    middlewares: {
      use(handler: Middleware) {
        middleware = handler
      },
    },
    ws: { send: overrides.send },
    moduleGraph: {},
  } as unknown as ViteDevServer)
  if (!middleware) throw new Error('Middleware was not mounted.')

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
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    baseUrl,
    origin: baseUrl,
    overrides,
  }
}

async function post(
  harness: Awaited<ReturnType<typeof startHarness>>,
  pathname: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${harness.baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      Origin: harness.origin,
      Host: new URL(harness.baseUrl).host,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function ndjson(response: Response): Promise<unknown[]> {
  const source = await response.text()
  return source
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
}

async function postChunked(
  harness: Awaited<ReturnType<typeof startHarness>>,
  pathname: string,
  chunks: Buffer[],
): Promise<{ status: number; body: string }> {
  const url = new URL(pathname, harness.baseUrl)
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          Origin: harness.origin,
          Host: url.host,
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked',
        },
      },
      (response) => {
        const responseChunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => {
          responseChunks.push(chunk)
        })
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(responseChunks).toString('utf8'),
          })
        })
      },
    )
    request.on('error', reject)
    for (const chunk of chunks) request.write(chunk)
    request.end()
  })
}

async function registerProposal(
  harness: Awaited<ReturnType<typeof startHarness>>,
): Promise<void> {
  harness.overrides.modelRunner.run.mockImplementationOnce(
    async function* () {
      yield {
        type: 'run-result',
        value: {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'proposal-call-1',
              toolName: 'propose_canvas_change',
              args: proposal().card,
              argsText: JSON.stringify(proposal().card),
            },
          ],
          status: {
            type: 'requires-action',
            reason: 'tool-calls',
          },
        },
      }
    },
  )
  const response = await post(
    harness,
    '/__design_ai/canvas/chat',
    chatBody(),
  )
  expect(response.status).toBe(200)
  await response.text()
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  )
  vi.restoreAllMocks()
})

describe('canvasAssistantPlugin', () => {
  it('allows opaque-origin GETs only to continue into read-only Vite module handling', async () => {
    const harness = await startHarness()

    const moduleResponse = await fetch(
      `${harness.baseUrl}/framework/src/preview/canvasPreviewFrame.tsx`,
      {
        headers: { Origin: 'null' },
      },
    )
    const viteEnvironmentResponse = await fetch(
      `${harness.baseUrl}/node_modules/vite/dist/client/env.mjs`,
      {
        headers: { Origin: 'null' },
      },
    )
    const unrelatedPackageResponse = await fetch(
      `${harness.baseUrl}/node_modules/unrelated-package/index.js`,
      {
        headers: { Origin: 'null' },
      },
    )
    const apiResponse = await fetch(
      `${harness.baseUrl}/__design_ai/canvas/context`,
      {
        headers: { Origin: 'null' },
      },
    )

    expect(moduleResponse.status).toBe(599)
    expect(moduleResponse.headers.get('access-control-allow-origin')).toBe(
      'null',
    )
    expect(
      viteEnvironmentResponse.headers.get(
        'access-control-allow-origin',
      ),
    ).toBe('null')
    expect(
      unrelatedPackageResponse.headers.get(
        'access-control-allow-origin',
      ),
    ).toBeNull()
    expect(apiResponse.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects a cross-origin chat POST with 403', async () => {
    const harness = await startHarness()

    const response = await post(
      harness,
      '/__design_ai/canvas/chat',
      chatBody(),
      { Origin: 'https://attacker.invalid' },
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('rejects non-JSON and bodies larger than 512 KiB', async () => {
    const harness = await startHarness()

    const nonJson = await post(
      harness,
      '/__design_ai/canvas/chat',
      chatBody(),
      { 'Content-Type': 'text/plain' },
    )
    const tooLarge = await post(
      harness,
      '/__design_ai/canvas/chat',
      'x'.repeat(512 * 1024 + 1),
    )

    expect(nonJson.status).toBe(415)
    expect(tooLarge.status).toBe(413)
  })

  it('rejects a chunked-transfer body larger than 512 KiB', async () => {
    const harness = await startHarness()
    const chunks = Array.from(
      { length: 8 },
      () => Buffer.alloc(64 * 1024, 0x20),
    )
    chunks.push(Buffer.from('x'))

    const response = await postChunked(
      harness,
      '/__design_ai/canvas/chat',
      chunks,
    )

    expect(response.status).toBe(413)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Canvas Assistant request body is too large.',
    })
  })

  it('returns 404 for unknown Canvas Assistant routes', async () => {
    const harness = await startHarness()

    const response = await post(
      harness,
      '/__design_ai/canvas/unknown',
      {},
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Canvas Assistant route not found.',
    })
  })

  it('returns ready only after the Canvas Style context loads', async () => {
    const overrides = defaultOverrides()
    let resolveLoad: ((value: CanvasAuthoringContext) => void) | undefined
    let markLoadStarted: (() => void) | undefined
    const loadStarted = new Promise<void>((resolve) => {
      markLoadStarted = resolve
    })
    overrides.contextLoader.load.mockImplementationOnce(
      () =>
        new Promise<CanvasAuthoringContext>((resolve) => {
          resolveLoad = resolve
          markLoadStarted?.()
        }),
    )
    const harness = await startHarness(overrides)

    let settled = false
    const pending = post(
      harness,
      '/__design_ai/canvas/context',
      { appId: 'design', canvasId: 'home' },
    ).then((response) => {
      settled = true
      return response
    })
    await loadStarted
    expect(settled).toBe(false)

    resolveLoad?.(context())
    const response = await pending

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ready: true })
    expect(overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('streams chat events with application/x-ndjson', async () => {
    const harness = await startHarness()

    const response = await post(
      harness,
      '/__design_ai/canvas/chat',
      chatBody(),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain(
      'application/x-ndjson',
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(ndjson(response)).resolves.toEqual([
      {
        type: 'run-result',
        value: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
    ])
  })

  it('aborts the model when the request closes before completion', async () => {
    const overrides = defaultOverrides()
    let capturedSignal: AbortSignal | undefined
    let markStarted: (() => void) | undefined
    let markAborted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const aborted = new Promise<void>((resolve) => {
      markAborted = resolve
    })
    overrides.modelRunner.run.mockImplementationOnce(
      async function* (input: { abortSignal: AbortSignal }) {
        capturedSignal = input.abortSignal
        markStarted?.()
        await new Promise<void>((resolve) =>
          input.abortSignal.addEventListener(
            'abort',
            () => {
              markAborted?.()
              resolve()
            },
            {
              once: true,
            },
          ),
        )
      },
    )
    const harness = await startHarness(overrides)

    const controller = new AbortController()
    const request = fetch(
      `${harness.baseUrl}/__design_ai/canvas/chat`,
      {
        method: 'POST',
        headers: {
          Origin: harness.origin,
          Host: new URL(harness.baseUrl).host,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatBody()),
        signal: controller.signal,
      },
    )
    await started
    controller.abort()
    await request.catch(() => undefined)
    await aborted

    expect(capturedSignal?.aborted).toBe(true)
  })

  it('streams checking, writing, validating, repair, and final apply events', async () => {
    const harness = await startHarness()
    await registerProposal(harness)

    const response = await post(
      harness,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      {
        aiConfig: {
          provider: 'openai',
          apiKey: API_KEY,
          model: 'repair-model',
        },
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain(
      'application/x-ndjson',
    )
    await expect(ndjson(response)).resolves.toEqual([
      { type: 'status', phase: 'checking' },
      { type: 'status', phase: 'writing' },
      { type: 'status', phase: 'validating' },
      { type: 'status', phase: 'repairing', attempt: 1 },
      {
        type: 'complete',
        result: {
          ok: true,
          proposalId: 'proposal-1',
          repairAttempts: 1,
        },
      },
    ])
    expect(harness.overrides.proposalStore.complete).toHaveBeenCalledWith(
      'proposal-1',
    )
  })

  it('does not log API keys or source', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const harness = await startHarness()
    await registerProposal(harness)

    const response = await post(
      harness,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      {
        aiConfig: {
          provider: 'openai',
          apiKey: API_KEY,
          model: 'repair-model',
        },
      },
    )
    await response.text()
    const logged = JSON.stringify([...log.mock.calls, ...error.mock.calls])

    expect(logged).not.toContain(API_KEY)
    expect(logged).not.toContain(CANDIDATE_SOURCE)
  })

  it('passes AI config to apply without storing it in the proposal', async () => {
    const harness = await startHarness()
    await registerProposal(harness)
    const aiConfig = {
      provider: 'anthropic' as const,
      apiKey: API_KEY,
      model: 'repair-model',
    }

    const response = await post(
      harness,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      { aiConfig },
    )
    await response.text()

    expect(
      harness.overrides.createCanvasRepairImpl,
    ).toHaveBeenCalledWith(aiConfig)
    expect(harness.overrides.proposalStore.claim).toHaveBeenCalledWith(
      'proposal-1',
      'design',
      'home',
    )
    expect(
      harness.overrides.applyProposalTransactionImpl.mock.calls[0]?.[0]
        .readSource,
    ).toBe(harness.overrides.readSourceImpl)
    expect(proposal()).not.toHaveProperty('aiConfig')
  })

  it('returns 409 when a completed proposal is applied again', async () => {
    const overrides = defaultOverrides()
    overrides.proposalStore.claim
      .mockReturnValueOnce(proposal())
      .mockImplementationOnce(() => {
        throw new Error('Canvas proposal has already been claimed.')
      })
    const harness = await startHarness(overrides)
    await registerProposal(harness)
    const body = {
      aiConfig: {
        provider: 'openai' as const,
        apiKey: API_KEY,
        model: 'repair-model',
      },
    }

    const first = await post(
      harness,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      body,
    )
    await first.text()
    const second = await post(
      harness,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      body,
    )

    expect(second.status).toBe(409)
    await expect(second.json()).resolves.toEqual({
      error: 'Canvas Assistant proposal is no longer available.',
    })
  })

  it('ends a rejected apply transaction with one failed complete event', async () => {
    const overrides = defaultOverrides()
    overrides.applyProposalTransactionImpl.mockImplementationOnce(
      async (input) => {
        input.onStatus({ phase: 'checking' })
        throw new Error('Rollback writer failed.')
      },
    )
    const harness = await startHarness(overrides)
    await registerProposal(harness)

    const response = await post(
      harness,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      {
        aiConfig: {
          provider: 'openai',
          apiKey: API_KEY,
          model: 'repair-model',
        },
      },
    )
    const events = await ndjson(response)

    expect(events).toEqual([
      { type: 'status', phase: 'checking' },
      {
        type: 'complete',
        result: {
          ok: false,
          proposalId: 'proposal-1',
          error:
            'Canvas proposal rollback was incomplete. Some files may need manual inspection.',
          rolledBack: false,
        },
      },
    ])
    expect(
      events.filter(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: unknown }).type === 'complete',
      ),
    ).toHaveLength(1)
    expect(overrides.proposalStore.complete).toHaveBeenCalledWith(
      'proposal-1',
    )
    expect(overrides.send).not.toHaveBeenCalled()
  })

  it('sends canvas-assistant:applied only after a successful transaction', async () => {
    const successful = await startHarness()
    await registerProposal(successful)

    const successResponse = await post(
      successful,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      {
        aiConfig: {
          provider: 'openai',
          apiKey: API_KEY,
          model: 'repair-model',
        },
      },
    )
    await successResponse.text()

    expect(successful.overrides.send).toHaveBeenCalledWith({
      type: 'custom',
      event: 'canvas-assistant:applied',
      data: { appId: 'design', canvasId: 'home' },
    })
    expect(
      successful.overrides.applyProposalTransactionImpl.mock.invocationCallOrder[0],
    ).toBeLessThan(successful.overrides.send.mock.invocationCallOrder[0])

    const failedOverrides = defaultOverrides()
    failedOverrides.applyProposalTransactionImpl.mockResolvedValueOnce({
      ok: false,
      proposalId: 'proposal-1',
      error: 'Canvas changed.',
      rolledBack: true,
    })
    const failed = await startHarness(failedOverrides)
    await registerProposal(failed)
    const failureResponse = await post(
      failed,
      '/__design_ai/canvas/proposals/proposal-1/apply',
      {
        aiConfig: {
          provider: 'openai',
          apiKey: API_KEY,
          model: 'repair-model',
        },
      },
    )
    await failureResponse.text()

    expect(failed.overrides.send).not.toHaveBeenCalled()
    expect(failed.overrides.proposalStore.complete).toHaveBeenCalledWith(
      'proposal-1',
    )
  })
})

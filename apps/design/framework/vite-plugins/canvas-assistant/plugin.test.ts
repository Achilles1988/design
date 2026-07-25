import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ViteDevServer } from 'vite'
import type {
  CanvasChatRequest,
  CanvasPreviewSessionRequest,
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
const PLUGIN_TEST_FILE = fileURLToPath(import.meta.url)
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
  const loadPreviewTargetImpl = vi.fn(
    async (request: CanvasPreviewSessionRequest) => {
      const canvasModulePath =
        `/apps/${request.appId}/canvases/Home.tsx`
      const componentModulePath =
        `/apps/${request.appId}/components/Button.tsx`
      return {
        ...request,
        componentFile: 'Home.tsx',
        canvasModulePaths: [canvasModulePath],
        componentModulePaths: [componentModulePath],
        guardedModuleFiles: [
          {
            modulePath: canvasModulePath,
            absolutePath: PLUGIN_TEST_FILE,
            realPath: PLUGIN_TEST_FILE,
          },
          {
            modulePath: componentModulePath,
            absolutePath: PLUGIN_TEST_FILE,
            realPath: PLUGIN_TEST_FILE,
          },
        ],
      }
    },
  )
  const send = vi.fn()
  const capture = vi.fn(async (urls: string[]) =>
    urls.map((url) => ({
      url,
      finalUrl: `${url}/final`,
      ok: true as const,
      mimeType: 'image/png' as const,
      bytes: new Uint8Array([137, 80, 78, 71]),
    })),
  )
  const closeCapture = vi.fn(async () => undefined)

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
    loadPreviewTargetImpl,
    captureService: { capture, close: closeCapture },
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

function chatForm(
  body: CanvasChatRequest = chatBody(),
  attachments: Record<string, Blob> = {},
): FormData {
  const form = new FormData()
  form.set('request', JSON.stringify(body))
  for (const [id, blob] of Object.entries(attachments)) {
    form.set(`attachment:${id}`, blob, `${id}.image`)
  }
  return form
}

async function postChat(
  harness: Awaited<ReturnType<typeof startHarness>>,
  body: CanvasChatRequest = chatBody(),
  attachments: Record<string, Blob> = {},
  headers: Record<string, string> = {},
) {
  return fetch(`${harness.baseUrl}/__design_ai/canvas/chat`, {
    method: 'POST',
    headers: {
      Origin: harness.origin,
      Host: new URL(harness.baseUrl).host,
      ...headers,
    },
    body: chatForm(body, attachments),
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
  contentType = 'application/json',
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
          'Content-Type': contentType,
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
  const response = await postChat(harness)
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
  it('captures URL references only for same-origin JSON POSTs', async () => {
    const harness = await startHarness()

    const response = await post(
      harness,
      '/__design_ai/references/capture',
      { urls: ['https://example.com/design'] },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          url: 'https://example.com/design',
          finalUrl: 'https://example.com/design/final',
          ok: true,
          mimeType: 'image/png',
          base64: 'iVBORw==',
        },
      ],
    })
    expect(harness.overrides.captureService.capture)
      .toHaveBeenCalledWith(
        ['https://example.com/design'],
        expect.any(AbortSignal),
      )

    const crossOrigin = await post(
      harness,
      '/__design_ai/references/capture',
      { urls: ['https://example.com'] },
      { Origin: 'https://attacker.invalid' },
    )
    const nonJson = await post(
      harness,
      '/__design_ai/references/capture',
      { urls: ['https://example.com'] },
      { 'Content-Type': 'text/plain' },
    )
    expect(crossOrigin.status).toBe(403)
    expect(nonJson.status).toBe(415)
  })

  it('returns per-URL capture errors and caps PNGs at 10 MiB', async () => {
    const overrides = defaultOverrides()
    overrides.captureService.capture.mockResolvedValueOnce([
      {
        url: 'https://large.example',
        ok: true,
        mimeType: 'image/png',
        bytes: new Uint8Array(10 * 1024 * 1024 + 1),
      },
      {
        url: 'https://failed.example',
        ok: false,
        error: 'Navigation failed.',
      },
    ])
    const harness = await startHarness(overrides)

    const response = await post(
      harness,
      '/__design_ai/references/capture',
      {
        urls: [
          'https://large.example',
          'https://failed.example',
        ],
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          url: 'https://large.example',
          ok: false,
          error: 'Captured image exceeds 10 MiB.',
        },
        {
          url: 'https://failed.example',
          ok: false,
          error: 'Navigation failed.',
        },
      ],
    })
  })

  it('rejects invalid capture bodies before browser work', async () => {
    const harness = await startHarness()

    const response = await post(
      harness,
      '/__design_ai/references/capture',
      {
        urls: [
          'https://one.example',
          'https://two.example',
          'https://three.example',
          'https://four.example',
          'https://five.example',
        ],
      },
    )

    expect(response.status).toBe(400)
    expect(harness.overrides.captureService.capture)
      .not.toHaveBeenCalled()
  })

  it('closes the shared browser on Vite server shutdown', async () => {
    const overrides = defaultOverrides()
    const httpServer = new EventEmitter()
    const plugin = canvasAssistantPlugin(
      {
        contentRoot: '/project/apps',
        stylesRoot: '/project/styles',
        layoutsRoot: '/project/layouts',
      },
      overrides,
    )
    plugin.configureServer?.({
      middlewares: { use: vi.fn() },
      ws: { send: overrides.send },
      moduleGraph: {},
      httpServer,
    } as unknown as ViteDevServer)

    httpServer.emit('close')
    await vi.waitFor(() => {
      expect(overrides.captureService.close).toHaveBeenCalledTimes(1)
    })
  })

  it('requires a current-Canvas preview capability for opaque-origin modules', async () => {
    const harness = await startHarness()

    const directModuleResponse = await fetch(
      `${harness.baseUrl}/framework/src/preview/canvasPreviewFrame.tsx`,
      {
        headers: { Origin: 'null' },
      },
    )
    const directAppResponse = await fetch(
      `${harness.baseUrl}/apps/other/canvases/Other.tsx?raw`,
      {
        headers: { Origin: 'null' },
      },
    )
    const sessionResponse = await post(
      harness,
      '/__design_ai/canvas/preview-session',
      {
        appId: 'design',
        canvasId: 'home',
      },
    )
    const session = (await sessionResponse.json()) as {
      moduleBase: string
      componentFile: string
      expiresAt: string
    }
    const allowedRuntimeResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}framework/src/preview/canvasPreviewFrame.tsx`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const allowedCanvasResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/design/canvases/Home.tsx`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const allowedComponentResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/design/components/Button.tsx`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const otherCanvasResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/design/canvases/Other.tsx?raw`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const otherAppResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/other/canvases/Other.tsx?raw`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const guessedTokenResponse = await fetch(
      `${harness.baseUrl}/__design_canvas_preview/00000000-0000-4000-8000-000000000000/apps/design/canvases/Home.tsx`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const stolenTokenResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/design/canvases/Home.tsx`,
      {
        headers: {
          Origin: 'https://attacker.invalid',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const sourceFetchResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/design/canvases/Home.tsx`,
      {
        headers: { Origin: 'null' },
      },
    )
    const rawImportResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/design/canvases/Home.tsx?raw`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const hmrImportResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}apps/design/canvases/Home.tsx?t=123`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )
    const privilegedResponse = await fetch(
      `${harness.baseUrl}${session.moduleBase}__design_fs/apps`,
      {
        headers: {
          Origin: 'null',
          'Sec-Fetch-Dest': 'script',
        },
      },
    )

    expect(directModuleResponse.status).toBe(403)
    expect(
      directModuleResponse.headers.get('access-control-allow-origin'),
    ).toBeNull()
    expect(directAppResponse.status).toBe(403)
    expect(
      directAppResponse.headers.get('access-control-allow-origin'),
    ).toBeNull()
    expect(sessionResponse.status).toBe(200)
    expect(session.componentFile).toBe('Home.tsx')
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now())
    expect(session.moduleBase).toMatch(
      /^\/__design_canvas_preview\/[0-9a-f-]{36}\/$/,
    )
    expect(allowedRuntimeResponse.status).toBe(599)
    expect(
      allowedRuntimeResponse.headers.get(
        'access-control-allow-origin',
      ),
    ).toBe('null')
    expect(allowedCanvasResponse.status).toBe(599)
    expect(
      allowedCanvasResponse.headers.get(
        'access-control-allow-origin',
      ),
    ).toBe('null')
    expect(allowedComponentResponse.status).toBe(599)
    expect(
      allowedComponentResponse.headers.get(
        'access-control-allow-origin',
      ),
    ).toBe('null')
    expect(otherCanvasResponse.status).toBe(403)
    expect(otherAppResponse.status).toBe(403)
    expect(guessedTokenResponse.status).toBe(403)
    expect(stolenTokenResponse.status).toBe(403)
    expect(sourceFetchResponse.status).toBe(403)
    expect(rawImportResponse.status).toBe(403)
    expect(hmrImportResponse.status).toBe(599)
    expect(privilegedResponse.status).toBe(403)
  })

  it('revokes a capability when its Canvas file becomes a symlink', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'preview-capability-'),
    )
    const canvasPath = path.join(root, 'Home.tsx')
    const otherPath = path.join(root, 'Other.tsx')
    const modulePath = '/apps/design/canvases/Home.tsx'
    await Promise.all([
      fs.writeFile(
        canvasPath,
        'export default function Home() { return null }',
      ),
      fs.writeFile(
        otherPath,
        'export default function Other() { return null }',
      ),
    ])
    const realCanvasPath = await fs.realpath(canvasPath)
    const overrides = defaultOverrides()
    overrides.loadPreviewTargetImpl.mockImplementation(
      async (request: CanvasPreviewSessionRequest) => ({
        ...request,
        componentFile: 'Home.tsx',
        canvasModulePaths: [modulePath],
        componentModulePaths: [],
        guardedModuleFiles: [
          {
            modulePath,
            absolutePath: canvasPath,
            realPath: realCanvasPath,
          },
        ],
      }),
    )

    try {
      const harness = await startHarness(overrides)
      const sessionResponse = await post(
        harness,
        '/__design_ai/canvas/preview-session',
        { appId: 'design', canvasId: 'home' },
      )
      const session = (await sessionResponse.json()) as {
        moduleBase: string
      }
      const requestModule = () =>
        fetch(
          `${harness.baseUrl}${session.moduleBase}apps/design/canvases/Home.tsx`,
          {
            headers: {
              Origin: 'null',
              'Sec-Fetch-Dest': 'script',
            },
          },
        )

      expect((await requestModule()).status).toBe(599)

      await fs.rm(canvasPath)
      await fs.symlink('Other.tsx', canvasPath)

      expect((await requestModule()).status).toBe(403)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a cross-origin chat POST with 403', async () => {
    const harness = await startHarness()

    const response = await postChat(
      harness,
      chatBody(),
      {},
      { Origin: 'https://attacker.invalid' },
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('rejects non-multipart chat and a request field larger than 512 KiB', async () => {
    const harness = await startHarness()

    const nonMultipart = await post(
      harness,
      '/__design_ai/canvas/chat',
      chatBody(),
    )
    const form = new FormData()
    form.set('request', 'x'.repeat(512 * 1024 + 1))
    const tooLarge = await fetch(
      `${harness.baseUrl}/__design_ai/canvas/chat`,
      {
        method: 'POST',
        headers: {
          Origin: harness.origin,
          Host: new URL(harness.baseUrl).host,
        },
        body: form,
      },
    )

    expect(nonMultipart.status).toBe(415)
    expect(tooLarge.status).toBe(413)
  })

  it('rejects an oversized multipart transport before model work', async () => {
    const harness = await startHarness()
    const form = chatForm()
    form.set(
      'unexpected',
      new Blob([new Uint8Array(34 * 1024 * 1024)], {
        type: 'application/octet-stream',
      }),
      'oversized.bin',
    )

    const response = await fetch(
      `${harness.baseUrl}/__design_ai/canvas/chat`,
      {
        method: 'POST',
        headers: {
          Origin: harness.origin,
          Host: new URL(harness.baseUrl).host,
        },
        body: form,
      },
    )

    const boundary = 'transport-limit'
    const chunked = await postChunked(
      harness,
      '/__design_ai/canvas/chat',
      [
        Buffer.from(
          `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="request"\r\n\r\n' +
            `${JSON.stringify(chatBody())}\r\n` +
            `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="unexpected"; filename="oversized.bin"\r\n' +
            'Content-Type: application/octet-stream\r\n\r\n',
        ),
        Buffer.alloc(34 * 1024 * 1024),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ],
      `multipart/form-data; boundary=${boundary}`,
    )

    expect(response.status).toBe(413)
    expect(chunked.status).toBe(413)
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('rejects malformed multipart without calling the model', async () => {
    const harness = await startHarness()

    const response = await postChunked(
      harness,
      '/__design_ai/canvas/chat',
      [Buffer.from('--missing\r\ninvalid\r\n--missing--\r\n')],
      'multipart/form-data; boundary=missing',
    )

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Canvas Assistant request is invalid.',
    })
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('rejects a missing referenced Blob and an unreferenced multipart image', async () => {
    const harness = await startHarness()
    const referenced = {
      ...chatBody(),
      messages: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'image' as const,
              image: 'wn-attachment:image-1',
            },
          ],
        },
      ],
    }

    const missing = await postChat(harness, referenced)
    const unreferenced = await postChat(harness, chatBody(), {
      'image-1': new Blob([new Uint8Array([1])], {
        type: 'image/png',
      }),
    })

    expect(missing.status).toBe(400)
    expect(unreferenced.status).toBe(400)
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('rejects more than eight images in the current user message', async () => {
    const harness = await startHarness()
    const ids = Array.from({ length: 9 }, (_, index) => `image-${index}`)
    const request: CanvasChatRequest = {
      ...chatBody(),
      messages: [
        {
          role: 'user',
          content: ids.map((id) => ({
            type: 'image' as const,
            image: `wn-attachment:${id}`,
          })),
        },
      ],
    }
    const attachments = Object.fromEntries(
      ids.map((id) => [
        id,
        new Blob([new Uint8Array([1])], { type: 'image/png' }),
      ]),
    )

    const response = await postChat(harness, request, attachments)

    expect(response.status).toBe(400)
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('rejects one image above 10 MiB or unique retained images above 30 MiB', async () => {
    const harness = await startHarness()
    const singleRequest: CanvasChatRequest = {
      ...chatBody(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: 'wn-attachment:image-1',
            },
          ],
        },
      ],
    }
    const oversized = await postChat(harness, singleRequest, {
      'image-1': new Blob(
        [new Uint8Array(10 * 1024 * 1024 + 1)],
        { type: 'image/png' },
      ),
    })
    const ids = ['image-1', 'image-2', 'image-3', 'image-4']
    const retainedRequest: CanvasChatRequest = {
      ...chatBody(),
      messages: ids.map((id) => ({
        role: 'user',
        content: [
          {
            type: 'image' as const,
            image: `wn-attachment:${id}`,
          },
        ],
      })),
    }
    const retained = await postChat(
      harness,
      retainedRequest,
      Object.fromEntries(
        ids.map((id, index) => [
          id,
          new Blob(
            [new Uint8Array(index === ids.length - 1
              ? 1
              : 10 * 1024 * 1024)],
            { type: 'image/png' },
          ),
        ]),
      ),
    )

    expect(oversized.status).toBe(400)
    expect(retained.status).toBe(400)
    await expect(retained.json()).resolves.toEqual({
      error:
        'This conversation contains more than 30 MB of visual references. Start a new chat before sending more images.',
    })
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
  })

  it('rejects retained visual history above 30 MiB without dropping old images', async () => {
    const harness = await startHarness()
    const ids = ['old-1', 'old-2', 'old-3', 'old-4']
    const request: CanvasChatRequest = {
      ...chatBody(),
      messages: [
        ...ids.map((id) => ({
          role: 'user' as const,
          content: [
            {
              type: 'image' as const,
              image: `wn-attachment:${id}`,
            },
          ],
        })),
        {
          role: 'user',
          content: [{ type: 'text', text: 'Continue' }],
        },
      ],
    }
    const response = await postChat(
      harness,
      request,
      Object.fromEntries(
        ids.map((id, index) => [
          id,
          new Blob(
            [new Uint8Array(index === ids.length - 1
              ? 1
              : 10 * 1024 * 1024)],
            { type: 'image/png' },
          ),
        ]),
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        'This conversation contains more than 30 MB of visual references. Start a new chat before sending more images.',
    })
    expect(harness.overrides.modelRunner.run).not.toHaveBeenCalled()
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

    const response = await postChat(harness)

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
        },
        body: chatForm(),
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

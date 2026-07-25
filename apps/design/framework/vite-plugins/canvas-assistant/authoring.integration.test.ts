import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ViteDevServer } from 'vite'
import {
  CanvasProposalCardArgsSchema,
  type CanvasProposalCardArgs,
  type CanvasChatRequest,
  type RawCanvasProposal,
} from '../../src/lib/canvasAssistantProtocol'
import { designFsPlugin } from '../design-fs/plugin'
import { createCanvasContextLoader } from './context'
import { createCanvasModelRunner } from './model'
import {
  createProposalStore,
  PROPOSAL_TTL_MS,
} from './proposals'
import { canvasAssistantPlugin } from './plugin'
import {
  writeAtomically,
  type CandidateFile,
  type CandidateValidationTarget,
  type RepairRequest,
} from './transaction'

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>

type FakeModelCall =
  | {
      toolName: 'recommend_canvas_layout'
      args: { layoutId: string; reason: string }
    }
  | {
      toolName: 'propose_canvas_change'
      args: RawCanvasProposal
    }

type Fixture = Awaited<ReturnType<typeof createFixture>>
type NdjsonEvent = {
  type: string
  phase?: string
  attempt?: number
  result?: unknown
  value?: {
    content: Array<{
      type?: string
      toolName?: string
      args?: unknown
    }>
  }
}

const temporaryRoots: string[] = []
const servers: Array<ReturnType<typeof createServer>> = []
const AI_CONFIG = {
  provider: 'openai' as const,
  apiKey: 'test-key',
  model: 'test-model',
}
const ORIGINAL_CANVAS =
  'export default function Home() {\n  return <main>Original</main>\n}\n'

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function createFixture(options: {
  validate?: (targets: CandidateValidationTarget[]) => Promise<void>
  repair?: (request: RepairRequest) => Promise<CandidateFile[]>
} = {}) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'canvas-authoring-integration-'),
  )
  temporaryRoots.push(root)
  const contentRoot = path.join(root, 'apps')
  const appDir = path.join(contentRoot, 'design')
  const canvasesDir = path.join(appDir, 'canvases')
  const componentsDir = path.join(appDir, 'components')
  const assetsRoot = path.join(root, 'assets')
  const stylesRoot = path.join(assetsRoot, 'designmd')
  const layoutsRoot = path.join(assetsRoot, 'layoutmd')
  const appJson = path.join(appDir, 'app.json')
  const canvasFile = path.join(canvasesDir, 'Home.tsx')
  const modelCalls: FakeModelCall[] = []

  await Promise.all([
    fs.mkdir(canvasesDir, { recursive: true }),
    fs.mkdir(componentsDir, { recursive: true }),
    fs.mkdir(path.join(stylesRoot, 'dashboard'), { recursive: true }),
    fs.mkdir(path.join(layoutsRoot, 'sidebar-shell'), { recursive: true }),
    fs.mkdir(path.join(layoutsRoot, 'centered'), { recursive: true }),
  ])
  await Promise.all([
    writeJson(appJson, {
      id: 'design',
      name: 'Design',
      style: 'dashboard',
      layouts: ['sidebar-shell'],
    }),
    writeJson(path.join(appDir, 'canvases.json'), {
      canvases: [{ id: 'home', name: 'Home', component: 'Home.tsx' }],
    }),
    fs.writeFile(canvasFile, ORIGINAL_CANVAS, 'utf8'),
    fs.writeFile(
      path.join(componentsDir, 'Select.tsx'),
      'export function Select() {\n  return <button>Select</button>\n}\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(stylesRoot, 'dashboard', 'DESIGN.md'),
      '# Dashboard Style\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(layoutsRoot, 'sidebar-shell', 'LAYOUT.md'),
      '# Sidebar Shell\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(layoutsRoot, 'centered', 'LAYOUT.md'),
      '# Centered\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(layoutsRoot, 'centered', 'preview.html'),
      '<main>Centered preview</main>\n',
      'utf8',
    ),
    fs.writeFile(
      path.join(layoutsRoot, 'INDEX.md'),
      [
        '| dir | title | summary | tags | origin | preview |',
        '| --- | --- | --- | --- | --- | --- |',
        '| `sidebar-shell` | Sidebar Shell | Navigation shell | shell | core | N |',
        '| `centered` | Centered | Centered content | content | core | Y |',
        '',
      ].join('\n'),
      'utf8',
    ),
  ])

  const proposalStore = createProposalStore({
    now: () => Date.parse('2026-07-25T00:00:00.000Z'),
    ttlMs: PROPOSAL_TTL_MS,
  })
  const modelRunner = createCanvasModelRunner({
    stageProposal: proposalStore.stage,
    createModelImpl: () => ({}) as never,
    streamTextImpl: () => ({
      fullStream: (async function* () {
        const call = modelCalls.shift()
        if (!call) throw new Error('No fake model call was queued.')
        yield {
          type: 'tool-call',
          toolCallId: `call-${modelCalls.length}`,
          toolName: call.toolName,
          args: call.args,
        }
      })(),
    }),
  })
  const contextLoader = createCanvasContextLoader({
    contentRoot,
    stylesRoot,
    layoutsRoot,
  })
  const validator = vi.fn(
    async (
      _server: ViteDevServer,
      targets: CandidateValidationTarget[],
    ) => {
      await (options.validate ?? (async () => undefined))(targets)
    },
  )
  const repair = vi.fn(
    options.repair ??
      (async (request: RepairRequest) =>
        request.candidateFiles.map((file) => ({ ...file }))),
  )

  const middlewares: Middleware[] = []
  const send = vi.fn()
  const serverShape = {
    middlewares: {
      use(middleware: Middleware) {
        middlewares.push(middleware)
      },
    },
    ws: { send },
    moduleGraph: {},
  } as unknown as ViteDevServer
  designFsPlugin({ contentRoot, assetsRoot }).configureServer?.(serverShape)
  canvasAssistantPlugin(
    { contentRoot, stylesRoot, layoutsRoot },
    {
      contextLoader,
      proposalStore,
      modelRunner,
      validateCanvasImpl: validator,
      createCanvasRepairImpl: () => repair,
      writeAtomicallyImpl: writeAtomically,
      send,
    },
  ).configureServer?.(serverShape)

  const server = createServer((req, res) => {
    let index = 0
    const next = (): void => {
      const middleware = middlewares[index]
      index += 1
      if (!middleware) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      void Promise.resolve(middleware(req, res, next)).catch((error) => {
        res.statusCode = 500
        res.end(error instanceof Error ? error.message : String(error))
      })
    }
    next()
  })
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })
  servers.push(server)
  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    appDir,
    appJson,
    baseUrl,
    canvasFile,
    componentsDir,
    modelCalls,
    origin: baseUrl,
    repair,
    validator,
  }
}

async function post(fixture: Fixture, pathname: string, body: unknown) {
  return fetch(`${fixture.baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      Origin: fixture.origin,
      Host: new URL(fixture.baseUrl).host,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function chatBody(messages: CanvasChatRequest['messages'] = [{
  role: 'user',
  content: [{ type: 'text', text: 'Build the Canvas' }],
}]): CanvasChatRequest {
  return {
    appId: 'design',
    canvasId: 'home',
    aiConfig: AI_CONFIG,
    messages,
  }
}

async function readNdjson(response: Response): Promise<NdjsonEvent[]> {
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain(
    'application/x-ndjson',
  )
  return (await response.text())
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as NdjsonEvent)
}

async function runModel(
  fixture: Fixture,
  call: FakeModelCall,
  messages?: CanvasChatRequest['messages'],
) {
  fixture.modelCalls.push(call)
  return readNdjson(
    await post(
      fixture,
      '/__design_ai/canvas/chat',
      chatBody(messages),
    ),
  )
}

function proposalCard(events: NdjsonEvent[]): CanvasProposalCardArgs {
  const content = events.at(-1)?.value?.content ?? []
  const args = content.find(
    (part) =>
      part.type === 'tool-call' &&
      part.toolName === 'propose_canvas_change',
  )?.args
  return CanvasProposalCardArgsSchema.parse(args)
}

async function applyProposal(fixture: Fixture, proposalId: string) {
  return readNdjson(
    await post(
      fixture,
      `/__design_ai/canvas/proposals/${proposalId}/apply`,
      { aiConfig: AI_CONFIG },
    ),
  )
}

function canvasProposal(
  overrides: Partial<RawCanvasProposal> = {},
): RawCanvasProposal {
  return {
    mode: 'update',
    summary: ['Update the Home Canvas'],
    layout: {
      kind: 'installed',
      id: 'sidebar-shell',
      reason: 'It fits the App shell.',
    },
    files: [{
      path: 'canvases/Home.tsx',
      source:
        'export default function Home() {\n  return <main>Updated</main>\n}\n',
    }],
    reusedComponents: [],
    newSharedComponents: [],
    preserved: ['App navigation'],
    validationChecks: ['Vite transform'],
    ...overrides,
  }
}

afterEach(async () => {
  const closeResults = await Promise.allSettled(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  )
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  )
  vi.restoreAllMocks()
  const failedClose = closeResults.find(
    (result): result is PromiseRejectedResult =>
      result.status === 'rejected',
  )
  if (failedClose) throw failedClose.reason
})

describe('Canvas Assistant authoring server integration', () => {
  it('recommends, installs, then uses a library Layout', async () => {
    const fixture = await createFixture()

    const recommendation = await runModel(fixture, {
      toolName: 'recommend_canvas_layout',
      args: {
        layoutId: 'centered',
        reason: 'The content needs one focused column.',
      },
    })
    expect(recommendation[0]?.value?.content).toEqual([
      expect.objectContaining({
        type: 'tool-call',
        toolName: 'recommend_canvas_layout',
        args: expect.objectContaining({
          layoutId: 'centered',
          title: 'Centered',
        }),
      }),
    ])
    expect(JSON.parse(await fs.readFile(fixture.appJson, 'utf8'))).toEqual({
      id: 'design',
      name: 'Design',
      style: 'dashboard',
      layouts: ['sidebar-shell'],
    })

    const install = await post(
      fixture,
      '/__design_fs/assets/layoutmd/centered/apply',
      { appId: 'design' },
    )
    expect(install.status).toBe(200)
    expect(JSON.parse(await fs.readFile(fixture.appJson, 'utf8'))).toEqual({
      id: 'design',
      name: 'Design',
      style: 'dashboard',
      layouts: ['sidebar-shell', 'centered'],
    })

    const proposal = canvasProposal({
      layout: {
        kind: 'installed',
        id: 'centered',
        reason: 'The installed Layout now fits.',
      },
    })
    const events = await runModel(fixture, {
      toolName: 'propose_canvas_change',
      args: proposal,
    })
    const card = proposalCard(events)
    expect(card.layout).toEqual(proposal.layout)

    const applied = await applyProposal(fixture, card.proposalId)
    expect(applied.at(-1)?.result).toMatchObject({
      ok: true,
      repairAttempts: 0,
    })
    expect(await fs.readFile(fixture.canvasFile, 'utf8')).toBe(
      proposal.files[0]?.source,
    )
  })

  it('stages a temporary-layout proposal without changing app.json', async () => {
    const fixture = await createFixture()
    const before = await fs.readFile(fixture.appJson, 'utf8')
    const proposal = canvasProposal({
      layout: {
        kind: 'temporary',
        reason: 'No library Layout fits this one-off surface.',
      },
    })

    const card = proposalCard(
      await runModel(fixture, {
        toolName: 'propose_canvas_change',
        args: proposal,
      }),
    )
    expect(await fs.readFile(fixture.canvasFile, 'utf8')).toBe(ORIGINAL_CANVAS)
    expect(await fs.readFile(fixture.appJson, 'utf8')).toBe(before)

    const events = await applyProposal(fixture, card.proposalId)
    expect(events.at(-1)?.result).toMatchObject({ ok: true })
    expect(await fs.readFile(fixture.appJson, 'utf8')).toBe(before)
  })

  it('reuses an existing user component without modifying it', async () => {
    const fixture = await createFixture()
    const componentFile = path.join(fixture.componentsDir, 'Select.tsx')
    const componentBefore = await fs.readFile(componentFile, 'utf8')
    const proposal = canvasProposal({
      files: [{
        path: 'canvases/Home.tsx',
        source: [
          "import { Select } from '../components/Select'",
          'export default function Home() {',
          '  return <main><Select /></main>',
          '}',
          '',
        ].join('\n'),
      }],
      reusedComponents: ['components/Select.tsx'],
    })

    const card = proposalCard(
      await runModel(fixture, {
        toolName: 'propose_canvas_change',
        args: proposal,
      }),
    )
    const events = await applyProposal(fixture, card.proposalId)

    expect(events.at(-1)?.result).toMatchObject({ ok: true })
    expect(await fs.readFile(componentFile, 'utf8')).toBe(componentBefore)
    expect(await fs.readFile(fixture.canvasFile, 'utf8')).toContain(
      "from '../components/Select'",
    )
  })

  it('creates a new user component in the App components directory', async () => {
    const fixture = await createFixture()
    const componentFile = path.join(fixture.componentsDir, 'Metric.tsx')
    const proposal = canvasProposal({
      files: [
        {
          path: 'canvases/Home.tsx',
          source: [
            "import { Metric } from '../components/Metric'",
            'export default function Home() {',
            '  return <main><Metric /></main>',
            '}',
            '',
          ].join('\n'),
        },
        {
          path: 'components/Metric.tsx',
          source:
            'export function Metric() {\n  return <strong>42</strong>\n}\n',
        },
      ],
      newSharedComponents: ['components/Metric.tsx'],
    })

    const card = proposalCard(
      await runModel(fixture, {
        toolName: 'propose_canvas_change',
        args: proposal,
      }),
    )
    await expect(fs.access(componentFile)).rejects.toThrow()

    const events = await applyProposal(fixture, card.proposalId)
    expect(events.at(-1)?.result).toMatchObject({ ok: true })
    expect(await fs.readFile(componentFile, 'utf8')).toBe(
      proposal.files[1]?.source,
    )
  })

  it('rejects an IDE edit made between proposal and apply', async () => {
    const fixture = await createFixture()
    const proposal = canvasProposal()
    const card = proposalCard(
      await runModel(fixture, {
        toolName: 'propose_canvas_change',
        args: proposal,
      }),
    )
    const ideSource =
      'export default function Home() {\n  return <main>IDE edit</main>\n}\n'
    await fs.writeFile(fixture.canvasFile, ideSource, 'utf8')

    const events = await applyProposal(fixture, card.proposalId)

    expect(events.at(-1)?.result).toEqual({
      ok: false,
      proposalId: card.proposalId,
      error:
        'The Canvas changed after this proposal was created. Generate a new proposal.',
      rolledBack: true,
    })
    expect(await fs.readFile(fixture.canvasFile, 'utf8')).toBe(ideSource)
    expect(fixture.validator).not.toHaveBeenCalled()
  })

  it('rolls back Canvas and new components after two failed repairs', async () => {
    const repairedSources = ['Repair one', 'Repair two'].map(
      (label) =>
        `export default function Home() {\n  return <main>${label}</main>\n}\n`,
    )
    const canvasSourcesDuringValidation: string[] = []
    const componentSourcesDuringValidation: string[] = []
    const fixture = await createFixture({
      validate: async (targets) => {
        const canvasPath = targets.find(
          (target) => target.path === 'canvases/Home.tsx',
        )?.absolutePath
        if (!canvasPath) {
          throw new Error('Canvas validation target is missing.')
        }
        const componentPath = path.join(
          path.dirname(path.dirname(canvasPath)),
          'components',
          'Metric.tsx',
        )
        const [source, componentSource] = await Promise.all([
          fs.readFile(canvasPath, 'utf8'),
          fs.readFile(componentPath, 'utf8'),
        ])
        canvasSourcesDuringValidation.push(source)
        componentSourcesDuringValidation.push(componentSource)
        throw new Error(`Vite rejected: ${source}`)
      },
      repair: async (request) =>
        request.candidateFiles.map((file) => ({
          ...file,
          source:
            file.path === 'canvases/Home.tsx'
              ? repairedSources[request.attempt - 1]!
              : file.source,
        })),
    })
    const componentFile = path.join(fixture.componentsDir, 'Metric.tsx')
    const proposal = canvasProposal({
      files: [
        {
          path: 'canvases/Home.tsx',
          source: [
            "import { Metric } from '../components/Metric'",
            'export default function Home() {',
            '  return <main>INVALID<Metric /></main>',
            '}',
            '',
          ].join('\n'),
        },
        {
          path: 'components/Metric.tsx',
          source:
            'export function Metric() {\n  return <strong>INVALID</strong>\n}\n',
        },
      ],
      newSharedComponents: ['components/Metric.tsx'],
    })
    const card = proposalCard(
      await runModel(fixture, {
        toolName: 'propose_canvas_change',
        args: proposal,
      }),
    )

    const events = await applyProposal(fixture, card.proposalId)

    expect(events.filter((event) => event.phase === 'repairing')).toEqual([
      { type: 'status', phase: 'repairing', attempt: 1 },
      { type: 'status', phase: 'repairing', attempt: 2 },
    ])
    expect(events.at(-1)?.result).toEqual({
      ok: false,
      proposalId: card.proposalId,
      error: 'Canvas validation failed after two repair attempts.',
      rolledBack: true,
    })
    expect(fixture.validator).toHaveBeenCalledTimes(3)
    expect(fixture.repair).toHaveBeenCalledTimes(2)
    expect(canvasSourcesDuringValidation).toEqual([
      proposal.files[0]?.source,
      repairedSources[0],
      repairedSources[1],
    ])
    expect(componentSourcesDuringValidation).toEqual([
      proposal.files[1]?.source,
      proposal.files[1]?.source,
      proposal.files[1]?.source,
    ])
    expect(await fs.readFile(fixture.canvasFile, 'utf8')).toBe(ORIGINAL_CANVAS)
    await expect(fs.access(componentFile)).rejects.toThrow()
  })
})

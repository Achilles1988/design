import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import {
  createServer as createViteServer,
  type ViteDevServer,
} from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateObject } from 'ai'
import { createModel } from '../../src/lib/ai/client'
import type { AiConfig } from '../../src/lib/ai/config'
import type { CanvasAuthoringContext } from './context'
import type { StoredProposal } from './proposals'
import {
  applyProposalTransaction,
  createCanvasRepair,
  type CandidateValidationTarget,
  validateCanvas,
  writeAtomically,
} from './transaction'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

vi.mock('../../src/lib/ai/client', () => ({
  createModel: vi.fn(() => 'repair-model'),
}))

const ORIGINAL_CANVAS =
  'export default function Home() { return <main>Original</main> }'
const CANDIDATE_CANVAS =
  'export default function Home() { return <main>Candidate</main> }'
const REPAIRED_CANVAS =
  'export default function Home() { return <main>Repaired</main> }'
const ORIGINAL_CSS = '.home { color: navy; }'
const CANDIDATE_CSS = '.home { color: teal; }'
const READ_ONLY_BUTTON =
  'export function Button() { return <button>Keep me</button> }'
const NEW_SELECT =
  'export function Select() { return <select aria-label="Choice" /> }'

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex')
}

function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false)
}

function card(): StoredProposal['card'] {
  return {
    proposalId: 'proposal-1',
    mode: 'update',
    summary: ['Update the current Canvas'],
    styleId: 'dashboard',
    layout: {
      kind: 'installed',
      id: 'sidebar-shell',
      reason: 'Fits the Canvas',
    },
    changedFiles: [
      'canvases/Home.tsx',
      'components/Select.tsx',
    ],
    reusedComponents: [],
    newSharedComponents: ['components/Select.tsx'],
    preserved: ['Existing navigation'],
    validationChecks: ['Vite transform'],
    candidateFiles: [
      {
        path: 'canvases/Home.tsx',
        source: CANDIDATE_CANVAS,
      },
      {
        path: 'components/Select.tsx',
        source: NEW_SELECT,
      },
    ],
    expiresAt: '2026-07-24T12:30:00.000Z',
  }
}

describe('applyProposalTransaction', () => {
  let appDir: string
  let canvasPath: string
  let cssPath: string
  let buttonPath: string
  let selectPath: string
  let selectCssPath: string

  beforeEach(async () => {
    appDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'canvas-transaction-'),
    )
    canvasPath = path.join(appDir, 'canvases/Home.tsx')
    cssPath = path.join(appDir, 'canvases/Home.css')
    buttonPath = path.join(appDir, 'components/Button.tsx')
    selectPath = path.join(appDir, 'components/Select.tsx')
    selectCssPath = path.join(appDir, 'components/Select.css')
    await Promise.all([
      fs.mkdir(path.dirname(canvasPath), { recursive: true }),
      fs.mkdir(path.dirname(buttonPath), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(canvasPath, ORIGINAL_CANVAS),
      fs.writeFile(cssPath, ORIGINAL_CSS),
      fs.writeFile(buttonPath, READ_ONLY_BUTTON),
    ])
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(appDir, { recursive: true, force: true })
  })

  async function reloadContext(): Promise<CanvasAuthoringContext> {
    const fileEntries: Array<{
      relativePath: string
      absolutePath: string
      permission: 'write-existing' | 'read-only'
    }> = [
      {
        relativePath: 'canvases/Home.css',
        absolutePath: cssPath,
        permission: 'write-existing',
      },
      {
        relativePath: 'canvases/Home.tsx',
        absolutePath: canvasPath,
        permission: 'write-existing',
      },
      {
        relativePath: 'components/Button.tsx',
        absolutePath: buttonPath,
        permission: 'read-only',
      },
    ]
    if (await exists(selectPath)) {
      fileEntries.push({
        relativePath: 'components/Select.tsx',
        absolutePath: selectPath,
        permission: 'read-only',
      })
    }
    if (await exists(selectCssPath)) {
      fileEntries.push({
        relativePath: 'components/Select.css',
        absolutePath: selectCssPath,
        permission: 'read-only',
      })
    }
    const files = await Promise.all(
      fileEntries.map(async (file) => {
        const source = await fs.readFile(file.absolutePath, 'utf8')
        return { ...file, source, hash: sha256(source) }
      }),
    )
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
      files,
      componentsDir: path.join(appDir, 'components'),
    }
  }

  function proposal(
    overrides: Partial<StoredProposal> = {},
  ): StoredProposal {
    return {
      id: 'proposal-1',
      appId: 'design',
      canvasId: 'home',
      createdAt: Date.parse('2026-07-24T12:00:00.000Z'),
      expiresAt: Date.parse('2026-07-24T12:30:00.000Z'),
      state: 'applying',
      baseline: [
        {
          path: 'canvases/Home.tsx',
          hash: sha256(ORIGINAL_CANVAS),
          operation: 'write-existing',
        },
        {
          path: 'components/Select.tsx',
          hash: null,
          operation: 'create-shared',
        },
        {
          path: 'canvases/Home.css',
          hash: sha256(ORIGINAL_CSS),
          operation: 'read-only',
        },
        {
          path: 'components/Button.tsx',
          hash: sha256(READ_ONLY_BUTTON),
          operation: 'read-only',
        },
      ],
      candidateFiles: [
        {
          path: 'canvases/Home.tsx',
          source: CANDIDATE_CANVAS,
        },
        {
          path: 'components/Select.tsx',
          source: NEW_SELECT,
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
        originalUserIntent: 'Update the current Canvas.',
        constraints: {
          styleId: 'dashboard',
          layout: {
            kind: 'installed',
            id: 'sidebar-shell',
            reason: 'Fits the Canvas',
          },
          preserved: ['Existing navigation'],
        },
      },
      card: card(),
      ...overrides,
    }
  }

  function input(overrides: {
    proposal?: StoredProposal
    reloadContext?: () => Promise<CanvasAuthoringContext>
    validate?: (targets: CandidateValidationTarget[]) => Promise<void>
    repair?: ReturnType<typeof vi.fn>
    onStatus?: ReturnType<typeof vi.fn>
    writer?: ReturnType<typeof vi.fn>
  } = {}) {
    return {
      proposal: overrides.proposal ?? proposal(),
      reloadContext: overrides.reloadContext ?? reloadContext,
      writeAtomically:
        overrides.writer ?? vi.fn(writeAtomically),
      validate: overrides.validate ?? vi.fn(async () => undefined),
      repair:
        overrides.repair ??
        vi.fn(async () => {
          throw new Error('Repair should not run.')
        }),
      onStatus: overrides.onStatus ?? vi.fn(),
    }
  }

  async function repairDiagnostic(message: string): Promise<string> {
    const validate = vi
      .fn()
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce(undefined)
    const repair = vi.fn(
      async (request: {
        candidateFiles: StoredProposal['candidateFiles']
      }) => request.candidateFiles,
    )

    const result = await applyProposalTransaction(
      input({ validate, repair }),
    )

    expect(result).toEqual({
      ok: true,
      proposalId: 'proposal-1',
      repairAttempts: 1,
    })
    return repair.mock.calls[0][0].diagnostic
  }

  it('uses real Vite validation to reject an invalid newly created TSX dependency', async () => {
    const vite = await createViteServer({
      configFile: false,
      root: appDir,
      logLevel: 'silent',
      plugins: [react()],
      server: { middlewareMode: true },
    })
    const repair = vi.fn(async () => {
      throw new Error('Repair stopped after the regression was observed.')
    })
    const candidate = proposal({
      candidateFiles: [
        {
          path: 'canvases/Home.tsx',
          source: [
            "import { Select } from '../components/Select'",
            'export default function Home() {',
            '  return Select',
            '}',
          ].join('\n'),
        },
        {
          path: 'components/Select.tsx',
          source:
            'export function Select() { return <section>broken</div> }',
        },
      ],
    })

    try {
      const result = await applyProposalTransaction(
        input({
          proposal: candidate,
          validate: (targets) => validateCanvas(vite, targets),
          repair,
        }),
      )

      expect(result).toMatchObject({
        ok: false,
        proposalId: 'proposal-1',
      })
      expect(repair).toHaveBeenCalledOnce()
    } finally {
      await vite.close()
    }
  })

  it('rejects a changed baseline before writing', async () => {
    await fs.writeFile(canvasPath, 'changed after proposal')
    const writer = vi.fn(writeAtomically)

    const result = await applyProposalTransaction(input({ writer }))

    expect(result).toEqual({
      ok: false,
      proposalId: 'proposal-1',
      error:
        'The Canvas changed after this proposal was created. Generate a new proposal.',
      rolledBack: true,
    })
    expect(writer).not.toHaveBeenCalled()
    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      'changed after proposal',
    )
  })

  it.each([
    {
      name: 'App configuration',
      change: (current: CanvasAuthoringContext) => ({
        ...current,
        appConfigHash: 'changed-app-config-hash',
      }),
    },
    {
      name: 'Style contract',
      change: (current: CanvasAuthoringContext) => ({
        ...current,
        style: {
          ...current.style,
          source: '# Changed Dashboard',
          hash: 'changed-style-contract-hash',
        },
      }),
    },
    {
      name: 'selected installed Layout contract',
      change: (current: CanvasAuthoringContext) => ({
        ...current,
        installedLayouts: current.installedLayouts.map((layout) => ({
          ...layout,
          source: '# Changed Sidebar',
          hash: 'changed-layout-contract-hash',
        })),
      }),
    },
  ])(
    'rejects a changed $name before writing',
    async ({ change }) => {
      const current = await reloadContext()
      const writer = vi.fn(writeAtomically)

      const result = await applyProposalTransaction(
        input({
          reloadContext: async () => change(current),
          writer,
        }),
      )

      expect(result).toEqual({
        ok: false,
        proposalId: 'proposal-1',
        error:
          'The Canvas changed after this proposal was created. Generate a new proposal.',
        rolledBack: true,
      })
      expect(writer).not.toHaveBeenCalled()
    },
  )

  it('rejects a create-shared path that no longer is absent', async () => {
    await fs.writeFile(selectPath, 'created by another actor')
    const writer = vi.fn(writeAtomically)

    const result = await applyProposalTransaction(input({ writer }))

    expect(result.ok).toBe(false)
    expect(writer).not.toHaveBeenCalled()
    expect(await fs.readFile(selectPath, 'utf8')).toBe(
      'created by another actor',
    )
  })

  it('writes existing Canvas and new shared component together', async () => {
    const validate = vi.fn(async (targets: CandidateValidationTarget[]) => {
      expect(targets).toEqual([
        {
          path: 'canvases/Home.tsx',
          absolutePath: canvasPath,
        },
        {
          path: 'components/Select.tsx',
          absolutePath: selectPath,
        },
      ])
      await expect(fs.readFile(canvasPath, 'utf8')).resolves.toBe(
        CANDIDATE_CANVAS,
      )
      await expect(fs.readFile(selectPath, 'utf8')).resolves.toBe(
        NEW_SELECT,
      )
    })

    const result = await applyProposalTransaction(input({ validate }))

    expect(result.ok).toBe(true)
    expect(validate).toHaveBeenCalledOnce()
  })

  it('returns success without repair when validation passes', async () => {
    const validate = vi.fn(async () => undefined)
    const repair = vi.fn()

    const result = await applyProposalTransaction(
      input({ validate, repair }),
    )

    expect(result).toEqual({
      ok: true,
      proposalId: 'proposal-1',
      repairAttempts: 0,
    })
    expect(repair).not.toHaveBeenCalled()
  })

  it('passes a temporary Layout decision to repair without an installed contract', async () => {
    const transactionProposal = proposal()
    transactionProposal.trusted.selectedLayoutContract = null
    transactionProposal.trusted.constraints.layout = {
      kind: 'temporary',
      reason: 'Use a one-off comparison workspace.',
    }
    const validate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Vite rejected the candidate.'))
      .mockResolvedValueOnce(undefined)
    const repair = vi.fn(
      async (request: RepairRequest) => request.candidateFiles,
    )

    const result = await applyProposalTransaction(
      input({
        proposal: transactionProposal,
        validate,
        repair,
      }),
    )

    expect(result).toMatchObject({ ok: true, repairAttempts: 1 })
    expect(repair.mock.calls[0]?.[0].layoutDecision).toEqual({
      kind: 'temporary',
      reason: 'Use a one-off comparison workspace.',
    })
  })

  it('validates the current Canvas when only its CSS changes', async () => {
    const transactionProposal = proposal({
      baseline: [
        {
          path: 'canvases/Home.tsx',
          hash: sha256(ORIGINAL_CANVAS),
          operation: 'read-only',
        },
        {
          path: 'canvases/Home.css',
          hash: sha256(ORIGINAL_CSS),
          operation: 'write-existing',
        },
        {
          path: 'components/Button.tsx',
          hash: sha256(READ_ONLY_BUTTON),
          operation: 'read-only',
        },
      ],
      candidateFiles: [
        {
          path: 'canvases/Home.css',
          source: CANDIDATE_CSS,
        },
      ],
    })
    const validate = vi.fn(async () => undefined)

    const result = await applyProposalTransaction(
      input({ proposal: transactionProposal, validate }),
    )

    expect(result.ok).toBe(true)
    expect(validate).toHaveBeenCalledWith([
      {
        path: 'canvases/Home.css',
        absolutePath: cssPath,
      },
      {
        path: 'canvases/Home.tsx',
        absolutePath: canvasPath,
      },
    ])
    expect(await fs.readFile(cssPath, 'utf8')).toBe(CANDIDATE_CSS)
  })

  it('uses the first repaired candidate when it validates', async () => {
    const absolutePathWithSpaces =
      '/Users/Alice Smith/project/canvases/Home.tsx'
    const diagnosticError = new Error(
      `Transform failed at ${absolutePathWithSpaces}: Unexpected token (14:5); OPENAI_API_KEY=AIza-secret; ANTHROPIC_API_KEY=anthropic-secret; apiKey=sk-secret; Prompt: ${'private prompt '.repeat(
        800,
      )}`,
    )
    diagnosticError.stack = `${diagnosticError.message}\n    at hidden (${canvasPath}:1:1)`
    const validate = vi
      .fn()
      .mockRejectedValueOnce(diagnosticError)
      .mockResolvedValueOnce(undefined)
    const repair = vi.fn(async () => [
      {
        path: 'canvases/Home.tsx',
        source: REPAIRED_CANVAS,
      },
      {
        path: 'components/Select.tsx',
        source: NEW_SELECT,
      },
    ])
    const onStatus = vi.fn()

    const result = await applyProposalTransaction(
      input({ validate, repair, onStatus }),
    )

    expect(result).toEqual({
      ok: true,
      proposalId: 'proposal-1',
      repairAttempts: 1,
    })
    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      REPAIRED_CANVAS,
    )
    const repairRequest = repair.mock.calls[0][0]
    expect(repairRequest.attempt).toBe(1)
    expect(repairRequest).toMatchObject({
      originalUserIntent: 'Update the current Canvas.',
      styleContract: {
        id: 'dashboard',
        source: '# Dashboard',
      },
      layoutDecision: {
        kind: 'installed',
        id: 'sidebar-shell',
        reason: 'Fits the Canvas',
        contractSource: '# Sidebar Shell',
      },
      preservationConstraints: ['Existing navigation'],
    })
    expect(repairRequest.diagnostic).not.toContain(appDir)
    expect(repairRequest.diagnostic).not.toContain('Alice Smith')
    expect(repairRequest.diagnostic).not.toContain('AIza-secret')
    expect(repairRequest.diagnostic).not.toContain(
      'anthropic-secret',
    )
    expect(repairRequest.diagnostic).not.toContain('sk-secret')
    expect(repairRequest.diagnostic).not.toContain('private prompt')
    expect(repairRequest.diagnostic).not.toContain('at hidden')
    expect(repairRequest.diagnostic).toContain(
      'Unexpected token (14:5)',
    )
    expect(repairRequest.diagnostic.length).toBeLessThanOrEqual(8_000)
    expect(onStatus.mock.calls.map(([event]) => event)).toEqual([
      { phase: 'checking' },
      { phase: 'writing' },
      { phase: 'validating' },
      { phase: 'repairing', attempt: 1 },
      { phase: 'writing' },
      { phase: 'validating' },
    ])
  })

  const credentialLabels = [
    { name: 'authorization', text: 'Authorization', separator: ':' },
    { name: 'camel-case API key', text: 'apiKey', separator: '=' },
    { name: 'underscore API key', text: 'api_key', separator: '=' },
    { name: 'hyphenated API key', text: 'api-key', separator: '=' },
    { name: 'spaced API key', text: 'api key', separator: '=' },
    {
      name: 'environment API key',
      text: 'OPENAI_API_KEY',
      separator: '=',
    },
    {
      name: 'environment access token',
      text: 'OPENAI_ACCESS_TOKEN',
      separator: '=',
    },
    {
      name: 'environment auth token',
      text: 'OPENAI_AUTH_TOKEN',
      separator: '=',
    },
    {
      name: 'underscore-prefixed environment auth token',
      text: '_OPENAI_AUTH_TOKEN',
      separator: '=',
    },
    {
      name: 'environment secret key',
      text: 'OPENAI_SECRET_KEY',
      separator: '=',
    },
  ]
  const credentialLabelForms = [
    { name: 'unquoted label', quote: null },
    { name: 'single quoted label', quote: "'" },
    { name: 'double quoted label', quote: '"' },
  ]
  const credentialValues = [
    { name: 'unquoted', text: 'abc.def.ghi' },
    { name: 'single quoted', text: "'abc.def.ghi'" },
    { name: 'double quoted', text: '"abc.def.ghi"' },
    { name: 'unquoted Bearer', text: 'Bearer abc.def.ghi' },
    {
      name: 'single quoted Bearer',
      text: "'Bearer abc.def.ghi'",
    },
    {
      name: 'double quoted Bearer',
      text: '"Bearer abc.def.ghi"',
    },
  ]
  const credentialCases = credentialLabels.flatMap((label) =>
    credentialLabelForms.flatMap((labelForm) =>
      credentialValues.map((value) => {
        const assignment =
          labelForm.quote === null
            ? `${label.text}${label.separator}${value.text}`
            : `{${labelForm.quote}${label.text}${labelForm.quote}:${value.text}}`
        return {
          name: `${label.name}, ${labelForm.name}, ${value.name}`,
          diagnostic: `Request failed; ${assignment}`,
        }
      }),
    ),
  )

  it.each(credentialCases)(
    'removes a $name credential assignment',
    async ({ diagnostic: unsafeDiagnostic }) => {
      const diagnostic = await repairDiagnostic(unsafeDiagnostic)

      expect(diagnostic).toContain('Request failed')
      expect(diagnostic).not.toContain('abc.def.ghi')
      expect(diagnostic).not.toContain('Bearer')
    },
  )

  it('preserves HTTP URLs while removing absolute paths', async () => {
    const diagnostic = await repairDiagnostic(
      [
        'Docs: http://example.com/docs/error',
        'Secure docs: https://example.com/docs/error',
        'Routed docs: https://example.com/docs?next=/workspace/setup#/home/getting-started',
        'Unix source: /Users/Alice/project/Home.tsx',
        String.raw`Windows source: C:\Users\Alice\project\Home.tsx`,
        String.raw`Joined Windows source: joined=xC:\Users\Alice\project\Home.tsx`,
      ].join('\n'),
    )

    expect(diagnostic).toContain('http://example.com/docs/error')
    expect(diagnostic).toContain('https://example.com/docs/error')
    expect(diagnostic).toContain(
      'https://example.com/docs?next=/workspace/setup#/home/getting-started',
    )
    expect(diagnostic).not.toContain(
      '/Users/Alice/project/Home.tsx',
    )
    expect(diagnostic).not.toContain(
      String.raw`C:\Users\Alice\project\Home.tsx`,
    )
  })

  it.each([
    {
      name: 'Vite fs URL',
      unsafeUrl:
        'http://localhost:5173/@fs//Users/Alice/project/Home.tsx',
      safeUrl: 'http://localhost:5173/@fs/[absolute path]',
      absolutePath: '/Users/Alice/project/Home.tsx',
    },
    {
      name: 'Unix query path',
      unsafeUrl:
        'https://example.com/error?file=/Users/Alice/project/Home.tsx&mode=transform',
      safeUrl:
        'https://example.com/error?file=[absolute path]&mode=transform',
      absolutePath: '/Users/Alice/project/Home.tsx',
    },
    {
      name: 'Windows query path',
      unsafeUrl: String.raw`https://example.com/error?file=C:\Users\Alice\project\Home.tsx&mode=transform`,
      safeUrl:
        'https://example.com/error?file=[absolute path]&mode=transform',
      absolutePath: String.raw`C:\Users\Alice\project\Home.tsx`,
    },
    {
      name: 'Unix fragment path',
      unsafeUrl:
        'https://example.com/error#source=/Users/Alice/project/Home.tsx&line=4',
      safeUrl:
        'https://example.com/error#source=[absolute path]&line=4',
      absolutePath: '/Users/Alice/project/Home.tsx',
    },
    {
      name: 'Windows fragment path',
      unsafeUrl: String.raw`https://example.com/error#source=C:\Users\Alice\project\Home.tsx&line=4`,
      safeUrl:
        'https://example.com/error#source=[absolute path]&line=4',
      absolutePath: String.raw`C:\Users\Alice\project\Home.tsx`,
    },
    {
      name: 'encoded Vite fs URL',
      unsafeUrl:
        'http://localhost:5173/@fs/%2FUsers%2FAlice%2Fproject%2FHome.tsx',
      safeUrl: 'http://localhost:5173/@fs/[absolute path]',
      absolutePath:
        '%2FUsers%2FAlice%2Fproject%2FHome.tsx',
    },
    {
      name: 'encoded Unix query path',
      unsafeUrl:
        'https://example.com/error?file=%2FUsers%2FAlice%2Fproject%2FHome.tsx&mode=transform',
      safeUrl:
        'https://example.com/error?file=[absolute path]&mode=transform',
      absolutePath:
        '%2FUsers%2FAlice%2Fproject%2FHome.tsx',
    },
    {
      name: 'encoded Windows fragment path',
      unsafeUrl:
        'https://example.com/error#source=C%3A%5CUsers%5CAlice%5Cproject%5CHome.tsx&line=4',
      safeUrl:
        'https://example.com/error#source=[absolute path]&line=4',
      absolutePath:
        'C%3A%5CUsers%5CAlice%5Cproject%5CHome.tsx',
    },
    {
      name: 'double-encoded Vite fs URL',
      unsafeUrl:
        'http://localhost:5173/@fs/%252FUsers%252FAlice%252Fproject%252FHome.tsx',
      safeUrl: 'http://localhost:5173/@fs/[absolute path]',
      absolutePath:
        '%252FUsers%252FAlice%252Fproject%252FHome.tsx',
    },
    {
      name: 'double-encoded Unix query path',
      unsafeUrl:
        'https://example.com/error?file=%252FUsers%252FAlice%252Fproject%252FHome.tsx&mode=transform',
      safeUrl:
        'https://example.com/error?file=[absolute path]&mode=transform',
      absolutePath:
        '%252FUsers%252FAlice%252Fproject%252FHome.tsx',
    },
    {
      name: 'double-encoded Windows fragment path',
      unsafeUrl:
        'https://example.com/error#source=C%253A%255CUsers%255CAlice%255Cproject%255CHome.tsx&line=4',
      safeUrl:
        'https://example.com/error#source=[absolute path]&line=4',
      absolutePath:
        'C%253A%255CUsers%255CAlice%255Cproject%255CHome.tsx',
    },
  ])(
    'redacts a local path inside a $name',
    async ({ unsafeUrl, safeUrl, absolutePath }) => {
      const diagnostic = await repairDiagnostic(
        `Transform failed at ${unsafeUrl}`,
      )

      expect(diagnostic).toContain(safeUrl)
      expect(diagnostic).not.toContain(absolutePath)
    },
  )

  it('keeps a compiler reason after redacting Prompt content', async () => {
    const diagnostic = await repairDiagnostic(
      [
        'Prompt: private implementation prompt',
        'Private project source and instructions',
        'SyntaxError: Unexpected token (21:4)',
      ].join('\n'),
    )

    expect(diagnostic).not.toContain('private implementation prompt')
    expect(diagnostic).not.toContain(
      'Private project source and instructions',
    )
    expect(diagnostic).toContain(
      'SyntaxError: Unexpected token (21:4)',
    )
  })

  it.each([
    {
      name: 'Vite plugin diagnostic',
      reason:
        '[plugin:vite:import-analysis] Failed to resolve import "./missing"',
    },
    {
      name: 'Vite error',
      reason: 'ViteError: Import analysis failed',
    },
    {
      name: 'transform error',
      reason: 'TransformError: JSX parsing failed',
    },
    {
      name: 'resolve error',
      reason: 'Could not resolve "./missing" from Canvas',
    },
  ])(
    'keeps a $name after redacting Prompt content',
    async ({ reason }) => {
      const diagnostic = await repairDiagnostic(
        [
          'Prompt: private implementation prompt',
          'Private project source and instructions',
          reason,
        ].join('\n'),
      )

      expect(diagnostic).not.toContain(
        'private implementation prompt',
      )
      expect(diagnostic).not.toContain(
        'Private project source and instructions',
      )
      expect(diagnostic).toContain(reason)
    },
  )

  it('uses at most two repair attempts', async () => {
    const validate = vi.fn(async () => {
      throw new Error('still invalid')
    })
    const repair = vi.fn(
      async (request: {
        candidateFiles: StoredProposal['candidateFiles']
      }) => request.candidateFiles,
    )

    const result = await applyProposalTransaction(
      input({ validate, repair }),
    )

    expect(repair).toHaveBeenCalledTimes(2)
    expect(validate).toHaveBeenCalledTimes(3)
    expect(result).toEqual({
      ok: false,
      proposalId: 'proposal-1',
      error: 'Canvas validation failed after two repair attempts.',
      rolledBack: true,
    })
  })

  it('restores every existing file after final failure', async () => {
    const transactionProposal = proposal({
      baseline: [
        {
          path: 'canvases/Home.tsx',
          hash: sha256(ORIGINAL_CANVAS),
          operation: 'write-existing',
        },
        {
          path: 'canvases/Home.css',
          hash: sha256(ORIGINAL_CSS),
          operation: 'write-existing',
        },
        {
          path: 'components/Select.tsx',
          hash: null,
          operation: 'create-shared',
        },
        {
          path: 'components/Button.tsx',
          hash: sha256(READ_ONLY_BUTTON),
          operation: 'read-only',
        },
      ],
      candidateFiles: [
        {
          path: 'canvases/Home.tsx',
          source: CANDIDATE_CANVAS,
        },
        {
          path: 'canvases/Home.css',
          source: CANDIDATE_CSS,
        },
        {
          path: 'components/Select.tsx',
          source: NEW_SELECT,
        },
      ],
    })
    const validate = vi.fn(async () => {
      throw new Error('invalid')
    })
    const repair = vi.fn(
      async (request: {
        candidateFiles: StoredProposal['candidateFiles']
      }) => request.candidateFiles,
    )

    await applyProposalTransaction(
      input({ proposal: transactionProposal, validate, repair }),
    )

    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      ORIGINAL_CANVAS,
    )
    expect(await fs.readFile(cssPath, 'utf8')).toBe(ORIGINAL_CSS)
  })

  it('deletes every newly created shared file after final failure', async () => {
    const transactionProposal = proposal({
      baseline: [
        ...proposal().baseline,
        {
          path: 'components/Select.css',
          hash: null,
          operation: 'create-shared',
        },
      ],
      candidateFiles: [
        ...proposal().candidateFiles,
        {
          path: 'components/Select.css',
          source: '.select { display: grid; }',
        },
      ],
    })
    const validate = vi.fn(async () => {
      throw new Error('invalid')
    })
    const repair = vi.fn(
      async (request: {
        candidateFiles: StoredProposal['candidateFiles']
      }) => request.candidateFiles,
    )

    await applyProposalTransaction(
      input({ proposal: transactionProposal, validate, repair }),
    )

    expect(await exists(selectPath)).toBe(false)
    expect(await exists(selectCssPath)).toBe(false)
  })

  it('rolls back only targets written before a partial write failure', async () => {
    const transactionProposal = proposal({
      baseline: [
        {
          path: 'canvases/Home.tsx',
          hash: sha256(ORIGINAL_CANVAS),
          operation: 'write-existing',
        },
        {
          path: 'canvases/Home.css',
          hash: sha256(ORIGINAL_CSS),
          operation: 'write-existing',
        },
        {
          path: 'components/Button.tsx',
          hash: sha256(READ_ONLY_BUTTON),
          operation: 'read-only',
        },
      ],
      candidateFiles: [
        {
          path: 'canvases/Home.tsx',
          source: CANDIDATE_CANVAS,
        },
        {
          path: 'canvases/Home.css',
          source: CANDIDATE_CSS,
        },
      ],
    })
    const writer = vi.fn(
      async (absolutePath: string, source: string) => {
        if (absolutePath === cssPath) {
          throw new Error('CSS target is not writable.')
        }
        await writeAtomically(absolutePath, source)
      },
    )

    const result = await applyProposalTransaction(
      input({ proposal: transactionProposal, writer }),
    )

    expect(result).toEqual({
      ok: false,
      proposalId: 'proposal-1',
      error: 'Canvas proposal could not be applied.',
      rolledBack: true,
    })
    expect(writer).toHaveBeenCalledTimes(3)
    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      ORIGINAL_CANVAS,
    )
    expect(await fs.readFile(cssPath, 'utf8')).toBe(ORIGINAL_CSS)
  })

  it('reports an incomplete rollback and keeps restoring other targets', async () => {
    const transactionProposal = proposal({
      baseline: [
        {
          path: 'canvases/Home.tsx',
          hash: sha256(ORIGINAL_CANVAS),
          operation: 'write-existing',
        },
        {
          path: 'canvases/Home.css',
          hash: sha256(ORIGINAL_CSS),
          operation: 'write-existing',
        },
        {
          path: 'components/Select.tsx',
          hash: null,
          operation: 'create-shared',
        },
      ],
      candidateFiles: [
        {
          path: 'canvases/Home.tsx',
          source: CANDIDATE_CANVAS,
        },
        {
          path: 'canvases/Home.css',
          source: CANDIDATE_CSS,
        },
        {
          path: 'components/Select.tsx',
          source: NEW_SELECT,
        },
      ],
    })
    const validate = vi.fn(async () => {
      throw new Error('invalid')
    })
    const repair = vi.fn(
      async (request: {
        candidateFiles: StoredProposal['candidateFiles']
      }) => request.candidateFiles,
    )
    const writer = vi.fn(
      async (absolutePath: string, source: string) => {
        if (
          absolutePath === canvasPath &&
          source === ORIGINAL_CANVAS
        ) {
          throw new Error('Canvas restore failed.')
        }
        await writeAtomically(absolutePath, source)
      },
    )

    const result = await applyProposalTransaction(
      input({
        proposal: transactionProposal,
        validate,
        repair,
        writer,
      }),
    )

    expect(result).toEqual({
      ok: false,
      proposalId: 'proposal-1',
      error:
        'Canvas proposal rollback was incomplete. Some files may need manual inspection.',
      rolledBack: false,
    })
    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      CANDIDATE_CANVAS,
    )
    expect(await fs.readFile(cssPath, 'utf8')).toBe(ORIGINAL_CSS)
    expect(await exists(selectPath)).toBe(false)
  })

  it('reports an incomplete rollback when a created file cannot be deleted', async () => {
    let validationAttempt = 0
    const validate = vi.fn(async () => {
      validationAttempt += 1
      if (validationAttempt === 3) {
        await fs.rm(selectPath, { force: true })
        await fs.mkdir(selectPath)
        await fs.writeFile(path.join(selectPath, 'keep.txt'), 'keep')
      }
      throw new Error('invalid')
    })
    const repair = vi.fn(
      async (request: {
        candidateFiles: StoredProposal['candidateFiles']
      }) => request.candidateFiles,
    )

    const result = await applyProposalTransaction(
      input({ validate, repair }),
    )

    expect(result).toEqual({
      ok: false,
      proposalId: 'proposal-1',
      error:
        'Canvas proposal rollback was incomplete. Some files may need manual inspection.',
      rolledBack: false,
    })
    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      ORIGINAL_CANVAS,
    )
    expect((await fs.stat(selectPath)).isDirectory()).toBe(true)
  })

  it('never modifies an existing read-only shared component', async () => {
    const transactionProposal = proposal({
      candidateFiles: [
        ...proposal().candidateFiles,
        {
          path: 'components/Button.tsx',
          source: 'export function Button() { return null }',
        },
      ],
    })
    const writer = vi.fn(writeAtomically)

    const result = await applyProposalTransaction(
      input({ proposal: transactionProposal, writer }),
    )

    expect(result.ok).toBe(false)
    expect(writer).not.toHaveBeenCalled()
    expect(await fs.readFile(buttonPath, 'utf8')).toBe(
      READ_ONLY_BUTTON,
    )
  })

  it('rolls back when repair changes the original candidate set', async () => {
    const validate = vi.fn(async () => {
      throw new Error('invalid')
    })
    const repair = vi.fn(async () => [
      {
        path: 'canvases/Home.tsx',
        source: REPAIRED_CANVAS,
      },
    ])

    const result = await applyProposalTransaction(
      input({ validate, repair }),
    )

    expect(result).toEqual({
      ok: false,
      proposalId: 'proposal-1',
      error: 'Canvas repair returned an invalid candidate set.',
      rolledBack: true,
    })
    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      ORIGINAL_CANVAS,
    )
    expect(await exists(selectPath)).toBe(false)
  })

  it('rejects repaired sources with forbidden dependencies before writing them', async () => {
    const forbiddenSource = [
      "const target = '../../canvases/Other'",
      'export const other = import(/* @vite-ignore */ target)',
    ].join('\n')
    const validate = vi.fn().mockRejectedValueOnce(
      new Error('initial candidate is invalid'),
    )
    const repair = vi.fn(async () => [
      proposal().candidateFiles[0],
      {
        path: 'components/Select.tsx',
        source: forbiddenSource,
      },
    ])
    const writer = vi.fn(writeAtomically)

    const result = await applyProposalTransaction(
      input({ validate, repair, writer }),
    )

    expect(result).toEqual({
      ok: false,
      proposalId: 'proposal-1',
      error: 'Canvas proposal could not be applied.',
      rolledBack: true,
    })
    expect(validate).toHaveBeenCalledOnce()
    expect(
      writer.mock.calls.some(([, source]) => source === forbiddenSource),
    ).toBe(false)
    expect(await fs.readFile(canvasPath, 'utf8')).toBe(
      ORIGINAL_CANVAS,
    )
    expect(await exists(selectPath)).toBe(false)
  })
})

describe('writeAtomically', () => {
  it('creates parent directories and leaves no temporary file', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'canvas-atomic-write-'),
    )
    const target = path.join(root, 'nested/Canvas.tsx')

    try {
      await writeAtomically(target, CANDIDATE_CANVAS)

      expect(await fs.readFile(target, 'utf8')).toBe(
        CANDIDATE_CANVAS,
      )
      expect(await fs.readdir(path.dirname(target))).toEqual([
        'Canvas.tsx',
      ])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe('validateCanvas', () => {
  it('invalidates and transforms every target in stable relative-path order', async () => {
    const canvasModule = { id: '/project/canvases/Home.tsx' }
    const componentModule = { id: '/project/components/Select.tsx' }
    const getModuleById = vi.fn((id: string) =>
      id === canvasModule.id ? canvasModule : componentModule,
    )
    const invalidateModule = vi.fn()
    const transformRequest = vi.fn(async () => ({ code: 'ok' }))
    const server = {
      moduleGraph: { getModuleById, invalidateModule },
      transformRequest,
    } as unknown as ViteDevServer

    await validateCanvas(server, [
      {
        path: 'components/Select.tsx',
        absolutePath: componentModule.id,
      },
      {
        path: 'canvases/Home.tsx',
        absolutePath: canvasModule.id,
      },
    ])

    expect(invalidateModule.mock.calls).toEqual([
      [canvasModule],
      [componentModule],
    ])
    expect(transformRequest.mock.calls).toEqual([
      ['/@fs//project/canvases/Home.tsx'],
      ['/@fs//project/components/Select.tsx'],
    ])
  })

  it('rejects an empty Vite transform result with the candidate path', async () => {
    const server = {
      moduleGraph: {
        getModuleById: vi.fn(() => undefined),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () => null),
    } as unknown as ViteDevServer

    await expect(
      validateCanvas(server, [
        {
          path: 'components/Select.tsx',
          absolutePath: '/project/components/Select.tsx',
        },
      ]),
    ).rejects.toThrow(
      'Vite could not transform candidate "components/Select.tsx"',
    )
  })
})

describe('createCanvasRepair', () => {
  const aiConfig: AiConfig = {
    provider: 'anthropic',
    apiKey: 'secret',
    model: 'repair-model',
  }
  const candidateFiles = [
    {
      path: 'canvases/Home.tsx',
      source: CANDIDATE_CANVAS,
    },
    {
      path: 'components/Select.tsx',
      source: NEW_SELECT,
    },
  ]
  const trustedRepairContext = {
    originalUserIntent: 'Build an account analytics Canvas.',
    styleContract: {
      id: 'dashboard',
      source: '# Dashboard Style\nUse compact metric cards.',
    },
    layoutDecision: {
      kind: 'installed' as const,
      id: 'sidebar-shell',
      reason: 'Keep persistent navigation.',
      contractSource: '# Sidebar Shell\nKeep navigation visible.',
    },
    preservationConstraints: ['Existing navigation', 'Account filters'],
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the configured model and a schema limited to candidate paths', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { files: candidateFiles },
    } as never)

    const result = await createCanvasRepair(aiConfig)({
      attempt: 1,
      diagnostic: 'Vite transform failed.',
      candidateFiles,
      ...trustedRepairContext,
    })

    expect(createModel).toHaveBeenCalledWith(aiConfig)
    expect(result).toEqual(candidateFiles)
    const options = vi.mocked(generateObject).mock.calls[0][0]
    expect(
      options.schema.safeParse({
        files: [
          candidateFiles[0],
          {
            path: 'components/Renamed.tsx',
            source: NEW_SELECT,
          },
        ],
      }).success,
    ).toBe(false)
    const prompt = String(options.prompt)
    expect(prompt).toContain('Build an account analytics Canvas.')
    expect(prompt).toContain('# Dashboard Style')
    expect(prompt).toContain('# Sidebar Shell')
    expect(prompt).toContain('Existing navigation')
    expect(prompt).not.toContain(aiConfig.apiKey)
  })

  it.each([
    {
      name: 'missing',
      files: [candidateFiles[0]],
    },
    {
      name: 'added',
      files: [
        ...candidateFiles,
        {
          path: 'components/Extra.tsx',
          source: 'export const Extra = true',
        },
      ],
    },
    {
      name: 'renamed',
      files: [
        candidateFiles[0],
        {
          path: 'components/Renamed.tsx',
          source: NEW_SELECT,
        },
      ],
    },
  ])('rejects a $name candidate path set', async ({ files }) => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { files },
    } as never)

    await expect(
      createCanvasRepair(aiConfig)({
        attempt: 2,
        diagnostic: 'still invalid',
        candidateFiles,
        ...trustedRepairContext,
      }),
    ).rejects.toThrow(
      'Canvas repair returned an invalid candidate set.',
    )
  })
})

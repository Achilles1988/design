import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ViteDevServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateObject } from 'ai'
import { createModel } from '../../src/lib/ai/client'
import type { AiConfig } from '../../src/lib/ai/config'
import type { CanvasAuthoringContext } from './context'
import type { StoredProposal } from './proposals'
import {
  applyProposalTransaction,
  createCanvasRepair,
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
      canvas: {
        id: 'home',
        name: 'Home',
        component: 'Home.tsx',
      },
      style: {
        id: 'dashboard',
        relativePath: 'dashboard/DESIGN.md',
        source: '# Dashboard',
      },
      installedLayouts: [],
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
      card: card(),
      ...overrides,
    }
  }

  function input(overrides: {
    proposal?: StoredProposal
    validate?: (absoluteCanvasPath: string) => Promise<void>
    repair?: ReturnType<typeof vi.fn>
    onStatus?: ReturnType<typeof vi.fn>
    writer?: ReturnType<typeof vi.fn>
  } = {}) {
    return {
      proposal: overrides.proposal ?? proposal(),
      reloadContext,
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
    const validate = vi.fn(async (absoluteCanvasPath: string) => {
      expect(absoluteCanvasPath).toBe(canvasPath)
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
    expect(validate).toHaveBeenCalledWith(canvasPath)
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
    { name: 'authorization', text: 'Authorization:' },
    { name: 'camel-case API key', text: 'apiKey=' },
    { name: 'underscore API key', text: 'api_key=' },
    { name: 'hyphenated API key', text: 'api-key=' },
    { name: 'spaced API key', text: 'api key=' },
    { name: 'environment API key', text: 'OPENAI_API_KEY=' },
    {
      name: 'environment access token',
      text: 'OPENAI_ACCESS_TOKEN=',
    },
    {
      name: 'environment auth token',
      text: 'OPENAI_AUTH_TOKEN=',
    },
    {
      name: 'underscore-prefixed environment auth token',
      text: '_OPENAI_AUTH_TOKEN=',
    },
    {
      name: 'environment secret key',
      text: 'OPENAI_SECRET_KEY=',
    },
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
    credentialValues.map((value) => ({
      name: `${label.name}, ${value.name}`,
      diagnostic: `Request failed; ${label.text}${value.text}`,
    })),
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
  it('invalidates the current module and transforms its fs URL', async () => {
    const moduleNode = { id: '/project/canvases/Home.tsx' }
    const getModuleById = vi.fn(() => moduleNode)
    const invalidateModule = vi.fn()
    const transformRequest = vi.fn(async () => ({ code: 'ok' }))
    const server = {
      moduleGraph: { getModuleById, invalidateModule },
      transformRequest,
    } as unknown as ViteDevServer

    await validateCanvas(server, '/project/canvases/Home.tsx')

    expect(invalidateModule).toHaveBeenCalledWith(moduleNode)
    expect(transformRequest).toHaveBeenCalledWith(
      '/@fs//project/canvases/Home.tsx',
    )
  })

  it('rejects an empty Vite transform result', async () => {
    const server = {
      moduleGraph: {
        getModuleById: vi.fn(() => undefined),
        invalidateModule: vi.fn(),
      },
      transformRequest: vi.fn(async () => null),
    } as unknown as ViteDevServer

    await expect(
      validateCanvas(server, '/project/canvases/Home.tsx'),
    ).rejects.toThrow('Vite could not transform the Canvas.')
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
      }),
    ).rejects.toThrow(
      'Canvas repair returned an invalid candidate set.',
    )
  })
})

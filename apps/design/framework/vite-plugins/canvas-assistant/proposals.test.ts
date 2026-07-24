import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CanvasAuthoringContext } from './context'
import { createProposalStore, PROPOSAL_TTL_MS } from './proposals'

const START_TIME = Date.parse('2026-07-24T12:00:00.000Z')

function context(
  overrides: Partial<CanvasAuthoringContext> = {},
): CanvasAuthoringContext {
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
      source: '# Dashboard Style',
    },
    installedLayouts: [
      {
        id: 'sidebar-shell',
        relativePath: 'sidebar-shell/LAYOUT.md',
        source: '# Sidebar Shell',
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
    componentsDir: path.resolve('/project/design/components'),
    ...overrides,
  }
}

function rawProposal() {
  return {
    mode: 'update' as const,
    summary: ['Reuse Select in the account form'],
    layout: {
      kind: 'installed' as const,
      id: 'sidebar-shell',
      reason: 'Fits navigation',
    },
    files: [
      {
        path: 'canvases/Home.tsx',
        source: 'export default function Home() { return null }',
      },
      {
        path: 'components/Select.tsx',
        source: 'export function Select() { return null }',
      },
    ],
    reusedComponents: [],
    newSharedComponents: ['components/Select.tsx'],
    preserved: ['Navigation'],
    validationChecks: ['Vite transform'],
  }
}

function store(now: () => number = () => START_TIME) {
  return createProposalStore({ now, ttlMs: PROPOSAL_TTL_MS })
}

describe('createProposalStore', () => {
  it('sanitizes full candidate files out of card args', () => {
    const card = store().stage(context(), rawProposal())

    expect(card).not.toHaveProperty('files')
    expect(card).not.toHaveProperty('candidateFiles')
    expect(JSON.stringify(card)).not.toContain(
      'export default function Home',
    )
    expect(card.changedFiles).toEqual([
      'canvases/Home.tsx',
      'components/Select.tsx',
    ])
  })

  it('rejects candidate writes outside the current Canvas and components dir', () => {
    const raw = rawProposal()
    raw.files[1] = {
      path: 'canvases/Other.tsx',
      source: 'export default function Other() { return null }',
    }
    raw.newSharedComponents = []

    expect(() => store().stage(context(), raw)).toThrow()
  })

  it('rejects modification of an existing shared component', () => {
    const existingComponent = {
      relativePath: 'components/Select.tsx',
      absolutePath: '/project/design/components/Select.tsx',
      source: 'export function Select() { return null }',
      hash: 'select-hash',
      permission: 'read-only' as const,
    }

    expect(() =>
      store().stage(
        context({
          files: [...context().files, existingComponent],
        }),
        rawProposal(),
      ),
    ).toThrow()
  })

  it.each([
    '../shell.tsx',
    '/tmp/Outside.tsx',
    'styles/global.css',
    'components/Invalid.ts',
  ])('rejects candidate path %s', (candidatePath) => {
    const raw = rawProposal()
    raw.files[1] = {
      path: candidatePath,
      source: 'export const unsafe = true',
    }
    raw.newSharedComponents = [candidatePath]

    expect(() => store().stage(context(), raw)).toThrow()
  })

  it('rejects new shared component metadata that does not exactly match candidates', () => {
    const missing = rawProposal()
    missing.newSharedComponents = []
    const extra = rawProposal()
    extra.newSharedComponents.push('components/Extra.tsx')
    const duplicate = rawProposal()
    duplicate.newSharedComponents.push('components/Select.tsx')

    expect(() => store().stage(context(), missing)).toThrow()
    expect(() => store().stage(context(), extra)).toThrow()
    expect(() => store().stage(context(), duplicate)).toThrow()
  })

  it('rejects reused components outside the discovered read-only set', () => {
    const raw = rawProposal()
    raw.reusedComponents = ['components/Unknown.tsx']

    expect(() => store().stage(context(), raw)).toThrow()
  })

  it('rejects an installed Layout decision absent from app layouts', () => {
    const raw = rawProposal()
    raw.layout.id = 'not-installed'

    expect(() => store().stage(context(), raw)).toThrow()
  })

  it('rejects duplicate candidate file paths', () => {
    const raw = rawProposal()
    raw.files.push({ ...raw.files[0] })

    expect(() => store().stage(context(), raw)).toThrow()
  })

  it('rejects lexical aliases for the same candidate path', () => {
    const raw = rawProposal()
    raw.files.push({
      path: 'components/forms/../Select.tsx',
      source: 'export function AliasedSelect() { return null }',
    })
    raw.newSharedComponents.push(
      'components/forms/../Select.tsx',
    )

    expect(() => store().stage(context(), raw)).toThrow()
  })

  it('rejects non-portable case aliases for one candidate target', () => {
    const raw = rawProposal()
    raw.files.push({
      path: 'components/select.tsx',
      source: 'export function LowerSelect() { return null }',
    })
    raw.newSharedComponents.push('components/select.tsx')

    expect(() => store().stage(context(), raw)).toThrow()
  })

  it('accepts a new shared component and its CSS', () => {
    const raw = rawProposal()
    raw.files.push({
      path: 'components/Select.css',
      source: '.select { display: grid; }',
    })
    raw.newSharedComponents = [
      'components/Select.tsx',
      'components/Select.css',
    ]

    const proposalStore = store()
    const card = proposalStore.stage(context(), raw)
    const proposal = proposalStore.claim(card.proposalId, 'design', 'home')

    expect(proposal.baseline).toEqual([
      {
        path: 'canvases/Home.tsx',
        hash: 'home-hash',
        operation: 'write-existing',
      },
      {
        path: 'components/Select.tsx',
        hash: null,
        operation: 'create-shared',
      },
      {
        path: 'components/Select.css',
        hash: null,
        operation: 'create-shared',
      },
    ])
  })

  it('binds non-candidate writable files and reused components read-only', () => {
    const proposalStore = store()
    const fullContext = context({
      files: [
        ...context().files,
        {
          relativePath: 'canvases/Home.css',
          absolutePath: '/project/design/canvases/Home.css',
          source: '.home {}',
          hash: 'home-css-hash',
          permission: 'write-existing',
        },
        {
          relativePath: 'components/Button.tsx',
          absolutePath: '/project/design/components/Button.tsx',
          source: 'export function Button() { return null }',
          hash: 'button-hash',
          permission: 'read-only',
        },
        {
          relativePath: 'components/Unused.tsx',
          absolutePath: '/project/design/components/Unused.tsx',
          source: 'export function Unused() { return null }',
          hash: 'unused-hash',
          permission: 'read-only',
        },
      ],
    })
    const raw = rawProposal()
    raw.reusedComponents = ['components/Button.tsx']
    const card = proposalStore.stage(fullContext, raw)
    const proposal = proposalStore.claim(card.proposalId, 'design', 'home')

    expect(proposal.baseline).toEqual([
      {
        path: 'canvases/Home.tsx',
        hash: 'home-hash',
        operation: 'write-existing',
      },
      {
        path: 'components/Select.tsx',
        hash: null,
        operation: 'create-shared',
      },
      {
        path: 'canvases/Home.css',
        hash: 'home-css-hash',
        operation: 'read-only',
      },
      {
        path: 'components/Button.tsx',
        hash: 'button-hash',
        operation: 'read-only',
      },
    ])
    expect(
      proposal.baseline.filter(
        (entry) => entry.path === 'canvases/Home.tsx',
      ),
    ).toHaveLength(1)
  })

  it('expires a proposal after thirty minutes', () => {
    let currentTime = START_TIME
    const proposalStore = store(() => currentTime)
    const card = proposalStore.stage(context(), rawProposal())

    expect(PROPOSAL_TTL_MS).toBe(30 * 60 * 1000)
    expect(card.expiresAt).toBe(
      new Date(START_TIME + 30 * 60 * 1000).toISOString(),
    )

    currentTime += 30 * 60 * 1000
    expect(() =>
      proposalStore.claim(card.proposalId, 'design', 'home'),
    ).toThrow()
  })

  it('rejects any proposal TTL other than thirty minutes', () => {
    expect(() =>
      createProposalStore({
        now: () => START_TIME,
        ttlMs: PROPOSAL_TTL_MS + 1,
      }),
    ).toThrow()
  })

  it('claims a proposal once and rejects every later claim', () => {
    const proposalStore = store()
    const card = proposalStore.stage(context(), rawProposal())

    expect(
      proposalStore.claim(card.proposalId, 'design', 'home').state,
    ).toBe('applying')
    expect(() =>
      proposalStore.claim(card.proposalId, 'design', 'home'),
    ).toThrow()
    expect(() =>
      proposalStore.claim(card.proposalId, 'design', 'other'),
    ).toThrow()
  })

  it('keeps claimed lifecycle state private from returned snapshots', () => {
    const proposalStore = store()
    const card = proposalStore.stage(context(), rawProposal())
    const claimed = proposalStore.claim(
      card.proposalId,
      'design',
      'home',
    )

    claimed.state = 'ready'

    expect(() =>
      proposalStore.claim(card.proposalId, 'design', 'home'),
    ).toThrow()
  })

  it('keeps completed lifecycle state private from returned snapshots', () => {
    const proposalStore = store()
    const card = proposalStore.stage(context(), rawProposal())
    const claimed = proposalStore.claim(
      card.proposalId,
      'design',
      'home',
    )
    proposalStore.complete(card.proposalId)

    claimed.state = 'ready'

    expect(() =>
      proposalStore.claim(card.proposalId, 'design', 'home'),
    ).toThrow()
  })

  it('marks both a successful and a failed apply complete forever', () => {
    const proposalStore = store()
    const successfulCard = proposalStore.stage(context(), rawProposal())
    const failedCard = proposalStore.stage(context(), rawProposal())
    const successful = proposalStore.claim(
      successfulCard.proposalId,
      'design',
      'home',
    )
    const failed = proposalStore.claim(
      failedCard.proposalId,
      'design',
      'home',
    )

    proposalStore.complete(successful.id)
    proposalStore.complete(failed.id)

    expect(() =>
      proposalStore.claim(successful.id, 'design', 'home'),
    ).toThrow()
    expect(() =>
      proposalStore.claim(failed.id, 'design', 'home'),
    ).toThrow()
  })
})

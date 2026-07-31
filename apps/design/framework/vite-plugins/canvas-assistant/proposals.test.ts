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
      style: { light: 'daylight', dark: 'dashboard' },
      layouts: ['sidebar-shell'],
    },
    appConfigHash: 'app-config-hash',
    canvas: {
      id: 'home',
      name: 'Home',
      component: 'Home.tsx',
    },
    styles: {
      light: {
        id: 'daylight',
        relativePath: 'daylight/DESIGN.md',
        source: '# Daylight Style',
        hash: 'light-style-contract-hash',
      },
      dark: {
        id: 'dashboard',
        relativePath: 'dashboard/DESIGN.md',
        source: '# Dashboard Style',
        hash: 'style-contract-hash',
      },
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
  const proposalStore = createProposalStore({
    now,
    ttlMs: PROPOSAL_TTL_MS,
  })
  return {
    ...proposalStore,
    stage(
      stageContext: CanvasAuthoringContext,
      rawToolArgs: unknown,
      originalUserIntent = 'Update the current Canvas.',
    ) {
      return proposalStore.stage(
        stageContext,
        rawToolArgs,
        originalUserIntent,
      )
    },
  }
}

describe('createProposalStore', () => {
  it('stores trusted design fingerprints, constraints, and minimal intent', () => {
    const proposalStore = store()
    const card = proposalStore.stage(
      context(),
      rawProposal(),
      'Build an account form.',
    )

    const claimed = proposalStore.claim(
      card.proposalId,
      'design',
      'home',
    )
    expect(claimed.trusted).toEqual({
      appConfigHash: 'app-config-hash',
      styleContracts: {
        light: {
          id: 'daylight',
          hash: 'light-style-contract-hash',
        },
        dark: {
          id: 'dashboard',
          hash: 'style-contract-hash',
        },
      },
      selectedLayoutContract: {
        id: 'sidebar-shell',
        hash: 'layout-contract-hash',
      },
      originalUserIntent: 'Build an account form.',
      constraints: {
        styleIds: { light: 'daylight', dark: 'dashboard' },
        layout: rawProposal().layout,
        preserved: ['Navigation'],
      },
    })
    expect(claimed.card.styleIds).toEqual({
      light: 'daylight',
      dark: 'dashboard',
    })
  })

  it('stores only the configured slot when one Style slot is empty', () => {
    const proposalStore = store()
    const card = proposalStore.stage(
      context({
        app: {
          id: 'design',
          name: 'Design',
          style: { dark: 'dashboard' },
          layouts: ['sidebar-shell'],
        },
        styles: {
          dark: {
            id: 'dashboard',
            relativePath: 'dashboard/DESIGN.md',
            source: '# Dashboard Style',
            hash: 'style-contract-hash',
          },
        },
      }),
      rawProposal(),
      'Build an account form.',
    )

    const claimed = proposalStore.claim(card.proposalId, 'design', 'home')
    expect(claimed.trusted.styleContracts).toEqual({
      dark: { id: 'dashboard', hash: 'style-contract-hash' },
    })
    expect(claimed.trusted.constraints.styleIds).toEqual({
      dark: 'dashboard',
    })
    expect(card.styleIds).toEqual({ dark: 'dashboard' })
  })

  it('stores no installed Layout fingerprint for a temporary Layout', () => {
    const proposalStore = store()
    const raw = rawProposal()
    raw.layout = {
      kind: 'temporary',
      reason: 'Use a one-off comparison workspace.',
    }
    const card = proposalStore.stage(
      context(),
      raw,
      'Compare the account cohorts.',
    )

    const claimed = proposalStore.claim(
      card.proposalId,
      'design',
      'home',
    )
    expect(claimed.trusted.selectedLayoutContract).toBeNull()
    expect(claimed.trusted.constraints.layout).toEqual(raw.layout)
  })

  it('rejects an installed Layout whose contract is unavailable', () => {
    expect(() =>
      store().stage(
        context({ installedLayouts: [] }),
        rawProposal(),
      ),
    ).toThrow('The selected Layout contract could not be loaded.')
  })

  it('copies read-only candidate source into the card without making it authoritative', () => {
    const proposalStore = store()
    const card = proposalStore.stage(context(), rawProposal())

    expect(card).not.toHaveProperty('files')
    expect(card.candidateFiles).toEqual(rawProposal().files)
    expect(card.changedFiles).toEqual([
      'canvases/Home.tsx',
      'components/Select.tsx',
    ])

    card.candidateFiles[0]!.source = 'browser replacement'
    card.layout.reason = 'browser replacement'
    card.preserved[0] = 'browser replacement'
    const claimed = proposalStore.claim(
      card.proposalId,
      'design',
      'home',
    )
    expect(claimed.candidateFiles[0]!.source).toBe(
      'export default function Home() { return null }',
    )
    expect(claimed.trusted.constraints.layout.reason).toBe(
      'Fits navigation',
    )
    expect(claimed.trusted.constraints.preserved).toEqual([
      'Navigation',
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

  it('rejects a directly imported read-only component that is not declared', () => {
    const button = {
      relativePath: 'components/Button.tsx',
      absolutePath: '/project/design/components/Button.tsx',
      source: 'export function Button() { return null }',
      hash: 'button-hash',
      permission: 'read-only' as const,
    }
    const raw = rawProposal()
    raw.files[0].source = [
      "import { Button } from '../components/Button'",
      'export default function Home() { return <Button /> }',
    ].join('\n')

    expect(() =>
      store().stage(
        context({ files: [...context().files, button] }),
        raw,
      ),
    ).toThrow(
      'Reused components must exactly match imported read-only components.',
    )
  })

  it('rejects a declared read-only component that no candidate imports', () => {
    const button = {
      relativePath: 'components/Button.tsx',
      absolutePath: '/project/design/components/Button.tsx',
      source: 'export function Button() { return null }',
      hash: 'button-hash',
      permission: 'read-only' as const,
    }
    const raw = rawProposal()
    raw.reusedComponents = ['components/Button.tsx']

    expect(() =>
      store().stage(
        context({ files: [...context().files, button] }),
        raw,
      ),
    ).toThrow(
      'Reused components must exactly match imported read-only components.',
    )
  })

  it.each([
    ['./Other', 'another Canvas'],
    ['@/shell/SidebarShell', 'Shell-private source'],
    [
      '../../framework/src/preview/CanvasPreview',
      'framework source',
    ],
    [
      '../../framework/public/assets/designmd/dashboard/components',
      'Style implementation',
    ],
    [
      '../../framework/public/assets/layoutmd/sidebar-shell/layout',
      'Layout implementation',
    ],
    ['../../outside/Secret', 'an outside-App relative path'],
    ['../app.json', 'an arbitrary App file'],
    ['/absolute/Secret', 'an absolute path'],
  ])('rejects an import of %s (%s)', (moduleSpecifier) => {
    const raw = rawProposal()
    raw.files[0].source = [
      `import value from '${moduleSpecifier}'`,
      'export default function Home() { return value }',
    ].join('\n')

    expect(() => store().stage(context(), raw)).toThrow(
      'Candidate import is not allowed.',
    )
  })

  it.each([
    'typescript/lib/../../../framework/src/shell/SidebarShell',
    'typescript/lib/./internal',
    'typescript/lib//internal',
    String.raw`typescript\lib\..\framework`,
    'typescript/lib%2F..%2Fframework',
    'typescript/lib%5C..%5Cframework',
    'typescript/lib/%2e%2e/framework',
    'typescript/lib/%252e%252e/framework',
  ])('rejects unsafe bare package specifier %s', (moduleSpecifier) => {
    const raw = rawProposal()
    raw.files[0].source = [
      `import value from '${moduleSpecifier}'`,
      'export default function Home() { return value }',
    ].join('\n')

    expect(() => store().stage(context(), raw)).toThrow(
      'Candidate import is not allowed.',
    )
  })

  it('accepts legitimate scoped and unscoped package subpaths', () => {
    const raw = rawProposal()
    raw.files[0].source = [
      "import React from 'react'",
      "import jsxRuntime from 'react/jsx-runtime'",
      "import scoped from '@scope/pkg'",
      "import scopedSubpath from '@scope/pkg/subpath/file.js'",
      'export default function Home() {',
      '  return React.createElement(jsxRuntime, { scoped, scopedSubpath })',
      '}',
    ].join('\n')

    expect(() => store().stage(context(), raw)).not.toThrow()
  })

  it.each([
    "const modules = import.meta.glob('./*.tsx')",
    "const modules = import.meta.globEager('./*.tsx')",
    "const modules = import.meta['glob']('./*.tsx')",
    "const modules = (import.meta['globEager'])('./*.tsx')",
  ])('rejects a real Vite glob call: %s', (globCall) => {
    const raw = rawProposal()
    raw.files[0].source = [
      globCall,
      'export default function Home() { return modules }',
    ].join('\n')

    expect(() => store().stage(context(), raw)).toThrow(
      'Candidate Vite glob imports are not allowed.',
    )
  })

  it('allows Vite glob spelling inside TypeScript comments and strings', () => {
    const raw = rawProposal()
    raw.files[0].source = [
      "const example = \"import.meta.glob('./*.tsx')\"",
      "/* import.meta.globEager('./*.tsx') */",
      'export default function Home() { return example }',
    ].join('\n')

    expect(() => store().stage(context(), raw)).not.toThrow()
  })

  it.each([
    [
      "const target = './Other.tsx'",
      'import(/* @vite-ignore */ target)',
    ],
    [
      "const name = 'Other'",
      'import(/* @vite-ignore */ `./${name}.tsx`)',
    ],
    [
      '',
      "import('react', { with: { type: 'json' } })",
    ],
  ])(
    'rejects a dynamic import without exactly one literal argument: %s %s',
    (declaration, importCall) => {
      const raw = rawProposal()
      raw.files[0].source = [
        declaration,
        `export const other = ${importCall}`,
      ].join('\n')

      expect(() => store().stage(context(), raw)).toThrow(
        'Candidate import is not allowed.',
      )
    },
  )

  it('allows literal dynamic imports through the normal dependency allowlist', () => {
    const button = {
      relativePath: 'components/Button.tsx',
      absolutePath: '/project/design/components/Button.tsx',
      source: 'export function Button() { return null }',
      hash: 'button-hash',
      permission: 'read-only' as const,
    }
    const raw = rawProposal()
    raw.reusedComponents = ['components/Button.tsx']
    raw.files[0].source = [
      "export const packageModule = import('react')",
      "export const candidateModule = import('../components/Select')",
      'export const reusedModule = import(`../components/Button`)',
    ].join('\n')

    expect(() =>
      store().stage(
        context({ files: [...context().files, button] }),
        raw,
      ),
    ).not.toThrow()
  })

  it('rejects a literal dynamic import outside the normal dependency allowlist', () => {
    const raw = rawProposal()
    raw.files[0].source =
      "export const other = import('./Other.tsx')"

    expect(() => store().stage(context(), raw)).toThrow(
      'Candidate import is not allowed.',
    )
  })

  it.each([
    '@import "./Other.css";',
    '@IMPORT url("./Other.css");',
    String.raw`@\69mport "./Other.css";`,
    String.raw`@im\70ort "./Other.css";`,
    String.raw`@\000069 mport "./Other.css";`,
    String.raw`@\69\6d\70\6f\72\74 "./Other.css";`,
    '.note { content: "\n}\n@import "./Other.css";',
  ])('rejects a real CSS import rule: %s', (cssSource) => {
    const raw = rawProposal()
    raw.files.push({
      path: 'components/Select.css',
      source: cssSource,
    })
    raw.newSharedComponents.push('components/Select.css')

    expect(() => store().stage(context(), raw)).toThrow(
      'Candidate CSS imports are not allowed.',
    )
  })

  it('allows CSS import spelling in comments and strings and normal at-rules', () => {
    const raw = rawProposal()
    raw.files.push({
      path: 'components/Select.css',
      source: [
        '/* @import "./comment.css"; */',
        '.note::before { content: "@import \\"./string.css\\""; }',
        '@media (min-width: 40rem) { .select { display: grid; } }',
        '@keyframes enter { from { opacity: 0; } to { opacity: 1; } }',
        '@font-face { font-family: "Test"; src: local("Arial"); }',
      ].join('\n'),
    })
    raw.newSharedComponents.push('components/Select.css')

    expect(() => store().stage(context(), raw)).not.toThrow()
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
    raw.files[0].source = [
      "import React from 'react'",
      "import './Home.css'",
      "import { Button } from '../components/Button'",
      "import { Select } from '../components/Select'",
      'export default function Home() {',
      '  return <><Button /><Select /></>',
      '}',
    ].join('\n')
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

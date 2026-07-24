import { randomUUID } from 'node:crypto'
import {
  CanvasProposalCardArgsSchema,
  RawCanvasProposalSchema,
  type CanvasProposalCardArgs,
} from '../../src/lib/canvasAssistantProtocol'
import {
  validateCandidatePath,
  type CandidateOperation,
  type CanvasAuthoringContext,
} from './context'

export const PROPOSAL_TTL_MS = 30 * 60 * 1000

export type StoredProposal = {
  id: string
  appId: string
  canvasId: string
  createdAt: number
  expiresAt: number
  state: 'ready' | 'applying' | 'complete'
  baseline: Array<{
    path: string
    hash: string | null
    operation: 'write-existing' | 'create-shared' | 'read-only'
  }>
  candidateFiles: Array<{ path: string; source: string }>
  card: CanvasProposalCardArgs
}

type ProposalStoreOptions = {
  now: () => number
  ttlMs: number
}

function exactlyMatches(
  actual: string[],
  expected: string[],
): boolean {
  const actualPaths = new Set(actual)
  const expectedPaths = new Set(expected)
  return (
    actualPaths.size === actual.length &&
    expectedPaths.size === expected.length &&
    actualPaths.size === expectedPaths.size &&
    [...actualPaths].every((path) => expectedPaths.has(path))
  )
}

function candidateOperation(
  context: CanvasAuthoringContext,
  relativePath: string,
): CandidateOperation {
  return context.files.some(
    (file) => file.relativePath === relativePath,
  )
    ? 'write-existing'
    : 'create-shared'
}

export function createProposalStore({
  now,
  ttlMs,
}: ProposalStoreOptions) {
  if (ttlMs !== PROPOSAL_TTL_MS) {
    throw new Error('Canvas proposal TTL must be thirty minutes.')
  }
  const proposals = new Map<string, StoredProposal>()

  function stage(
    context: CanvasAuthoringContext,
    rawToolArgs: unknown,
  ): CanvasProposalCardArgs {
    const raw = RawCanvasProposalSchema.parse(rawToolArgs)
    const candidatePaths = raw.files.map((file) => file.path)
    if (new Set(candidatePaths).size !== candidatePaths.length) {
      throw new Error('Candidate file paths must be unique.')
    }

    const operations = raw.files.map((file) => {
      const operation = candidateOperation(context, file.path)
      validateCandidatePath(context, file.path, operation)
      return operation
    })
    const newSharedPaths = raw.files
      .filter((_, index) => operations[index] === 'create-shared')
      .map((file) => file.path)
    if (!exactlyMatches(raw.newSharedComponents, newSharedPaths)) {
      throw new Error(
        'New shared components must match create-shared candidate files.',
      )
    }

    const readOnlyPaths = new Set(
      context.files
        .filter((file) => file.permission === 'read-only')
        .map((file) => file.relativePath),
    )
    if (
      raw.reusedComponents.some(
        (componentPath) => !readOnlyPaths.has(componentPath),
      )
    ) {
      throw new Error(
        'Reused components must be discovered read-only components.',
      )
    }

    if (
      raw.layout.kind === 'installed' &&
      !context.app.layouts.includes(raw.layout.id)
    ) {
      throw new Error('The selected Layout is not installed.')
    }

    const createdAt = now()
    const expiresAt = createdAt + ttlMs
    const id = randomUUID()
    const card = CanvasProposalCardArgsSchema.parse({
      proposalId: id,
      mode: raw.mode,
      summary: raw.summary,
      styleId: context.style.id,
      layout: raw.layout,
      changedFiles: candidatePaths,
      reusedComponents: raw.reusedComponents,
      newSharedComponents: raw.newSharedComponents,
      preserved: raw.preserved,
      validationChecks: raw.validationChecks,
      expiresAt: new Date(expiresAt).toISOString(),
    })
    const contextFiles = new Map(
      context.files.map((file) => [file.relativePath, file]),
    )
    const baseline: StoredProposal['baseline'] = raw.files.map(
      (file, index) => ({
        path: file.path,
        hash:
          operations[index] === 'write-existing'
            ? contextFiles.get(file.path)?.hash ?? null
            : null,
        operation: operations[index],
      }),
    )
    const baselinePaths = new Set(candidatePaths)
    for (const file of context.files) {
      if (
        file.permission === 'write-existing' &&
        !baselinePaths.has(file.relativePath)
      ) {
        baseline.push({
          path: file.relativePath,
          hash: file.hash,
          operation: 'read-only',
        })
        baselinePaths.add(file.relativePath)
      }
    }
    for (const componentPath of raw.reusedComponents) {
      if (baselinePaths.has(componentPath)) continue
      const file = contextFiles.get(componentPath)
      if (!file) continue
      baseline.push({
        path: componentPath,
        hash: file.hash,
        operation: 'read-only',
      })
      baselinePaths.add(componentPath)
    }
    const stored: StoredProposal = {
      id,
      appId: context.app.id,
      canvasId: context.canvas.id,
      createdAt,
      expiresAt,
      state: 'ready',
      baseline,
      candidateFiles: raw.files.map((file) => ({ ...file })),
      card,
    }
    proposals.set(id, stored)
    return stored.card
  }

  function claim(
    proposalId: string,
    appId: string,
    canvasId: string,
  ): StoredProposal {
    const proposal = proposals.get(proposalId)
    if (!proposal) {
      throw new Error('Canvas proposal was not found.')
    }
    if (proposal.appId !== appId || proposal.canvasId !== canvasId) {
      throw new Error('Canvas proposal belongs to another Canvas.')
    }
    if (now() >= proposal.expiresAt) {
      proposal.state = 'complete'
      throw new Error('Canvas proposal has expired.')
    }
    if (proposal.state !== 'ready') {
      throw new Error('Canvas proposal has already been claimed.')
    }
    proposal.state = 'applying'
    return proposal
  }

  function complete(proposalId: string): void {
    const proposal = proposals.get(proposalId)
    if (!proposal) {
      throw new Error('Canvas proposal was not found.')
    }
    proposal.state = 'complete'
  }

  return { stage, claim, complete }
}

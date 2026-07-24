import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { generateObject } from 'ai'
import type { ViteDevServer } from 'vite'
import { z } from 'zod'
import { createModel } from '../../src/lib/ai/client'
import type { AiConfig } from '../../src/lib/ai/config'
import {
  validateCandidatePath,
  type CanvasAuthoringContext,
} from './context'
import type { StoredProposal } from './proposals'

const BASELINE_CHANGED_ERROR =
  'The Canvas changed after this proposal was created. Generate a new proposal.'
const INVALID_REPAIR_ERROR =
  'Canvas repair returned an invalid candidate set.'
const VALIDATION_FAILED_ERROR =
  'Canvas validation failed after two repair attempts.'
const APPLY_FAILED_ERROR = 'Canvas proposal could not be applied.'
const MAX_DIAGNOSTIC_LENGTH = 8_000

export type CandidateFile = StoredProposal['candidateFiles'][number]

export type RepairRequest = {
  attempt: 1 | 2
  diagnostic: string
  candidateFiles: CandidateFile[]
}

export type ApplyResult =
  | { ok: true; proposalId: string; repairAttempts: number }
  | {
      ok: false
      proposalId: string
      error: string
      rolledBack: true
    }

export type ApplyStatusEvent = {
  phase: 'checking' | 'writing' | 'validating' | 'repairing'
  attempt?: 1 | 2
}

type ApplyProposalTransactionInput = {
  proposal: StoredProposal
  reloadContext: () => Promise<CanvasAuthoringContext>
  writeAtomically: (
    absolutePath: string,
    source: string,
  ) => Promise<void>
  validate: (absoluteCanvasPath: string) => Promise<void>
  repair: (request: RepairRequest) => Promise<CandidateFile[]>
  onStatus: (event: ApplyStatusEvent) => void
}

type CandidateTarget = {
  path: string
  absolutePath: string
  operation: 'write-existing' | 'create-shared'
  originalSource: string | null
}

class InvalidCandidateSetError extends Error {
  constructor() {
    super(INVALID_REPAIR_ERROR)
    this.name = 'InvalidCandidateSetError'
  }
}

function exactlyMatchesPaths(
  actual: CandidateFile[],
  expectedPaths: string[],
): boolean {
  const actualPaths = actual.map((file) => file.path)
  const actualSet = new Set(actualPaths)
  const expectedSet = new Set(expectedPaths)
  return (
    actualSet.size === actualPaths.length &&
    expectedSet.size === expectedPaths.length &&
    actualSet.size === expectedSet.size &&
    [...actualSet].every((candidatePath) =>
      expectedSet.has(candidatePath),
    )
  )
}

function assertCandidateSet(
  candidates: CandidateFile[],
  expectedPaths: string[],
): void {
  if (!exactlyMatchesPaths(candidates, expectedPaths)) {
    throw new InvalidCandidateSetError()
  }
}

function compactDiagnostic(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error)
  const withoutStackFrames = raw
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s/.test(line))
    .join('\n')
  const sanitized = withoutStackFrames
    .replace(
      /\b[A-Za-z][A-Za-z0-9_]*(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET_KEY)\b\s*[:=]\s*[^\s;,]+/gi,
      '[credential]',
    )
    .replace(
      /\b(?:api[-_ ]?key|authorization)\b\s*[:=]\s*(?:Bearer\s+)?[^\s;,]+/gi,
      '[credential]',
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[credential]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[credential]')
    .replace(/\bPrompt\s*:[\s\S]*/gi, 'Prompt: [redacted]')
    .replace(
      /(["'])(?:[A-Za-z]:[\\/]|\/)[^\r\n]*?\1/g,
      '[absolute path]',
    )
    .replace(
      /(?:[A-Za-z]:[\\/]|\/)[^\r\n,;)"']*?\.[A-Za-z0-9_-]+(?=:\d|:\s|[\s,;)"']|$)/g,
      '[absolute path]',
    )
    .replace(
      /(?:[A-Za-z]:[\\/]|\/)[^\r\n,;)"']+?(?=:\s|[,;)"']|$)/g,
      '[absolute path]',
    )
    .replace(
      /(?:[A-Za-z]:[\\/]|\/)[^\s\r\n,;:)"']+/g,
      '[absolute path]',
    )
  return sanitized.slice(0, MAX_DIAGNOSTIC_LENGTH)
}

function baselineTargets(
  proposal: StoredProposal,
  context: CanvasAuthoringContext,
): CandidateTarget[] {
  if (
    context.app.id !== proposal.appId ||
    context.canvas.id !== proposal.canvasId
  ) {
    throw new Error(BASELINE_CHANGED_ERROR)
  }

  const baselinePaths = proposal.baseline.map((entry) => entry.path)
  if (new Set(baselinePaths).size !== baselinePaths.length) {
    throw new Error(BASELINE_CHANGED_ERROR)
  }

  const writableEntries = proposal.baseline.filter(
    (entry) => entry.operation !== 'read-only',
  )
  const expectedCandidatePaths = writableEntries.map(
    (entry) => entry.path,
  )
  if (
    !exactlyMatchesPaths(
      proposal.candidateFiles,
      expectedCandidatePaths,
    )
  ) {
    throw new Error(BASELINE_CHANGED_ERROR)
  }

  const currentFiles = new Map(
    context.files.map((file) => [file.relativePath, file]),
  )
  for (const entry of proposal.baseline) {
    const current = currentFiles.get(entry.path)
    if (entry.operation === 'create-shared') {
      if (entry.hash !== null || current) {
        throw new Error(BASELINE_CHANGED_ERROR)
      }
      try {
        validateCandidatePath(context, entry.path, 'create-shared')
      } catch {
        throw new Error(BASELINE_CHANGED_ERROR)
      }
      continue
    }
    if (
      typeof entry.hash !== 'string' ||
      !current ||
      current.hash !== entry.hash
    ) {
      throw new Error(BASELINE_CHANGED_ERROR)
    }
    if (entry.operation === 'write-existing') {
      try {
        validateCandidatePath(context, entry.path, 'write-existing')
      } catch {
        throw new Error(BASELINE_CHANGED_ERROR)
      }
    }
  }

  const appDir = path.dirname(context.componentsDir)
  return writableEntries.map((entry) => {
    if (entry.operation === 'write-existing') {
      const current = currentFiles.get(entry.path)
      if (!current) throw new Error(BASELINE_CHANGED_ERROR)
      return {
        path: entry.path,
        absolutePath: current.absolutePath,
        operation: entry.operation,
        originalSource: current.source,
      }
    }
    return {
      path: entry.path,
      absolutePath: path.resolve(appDir, entry.path),
      operation: entry.operation,
      originalSource: null,
    }
  })
}

async function rollbackTargets(
  targets: CandidateTarget[],
  writer: ApplyProposalTransactionInput['writeAtomically'],
): Promise<void> {
  const results = await Promise.allSettled(
    targets.map((target) =>
      target.operation === 'write-existing'
        ? writer(target.absolutePath, target.originalSource ?? '')
        : fs.rm(target.absolutePath, { force: true }),
    ),
  )
  const failure = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === 'rejected',
  )
  if (failure) throw failure.reason
}

export async function writeAtomically(
  file: string,
  source: string,
): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.canvas-assistant.tmp`
  await fs.writeFile(temp, source, { encoding: 'utf8', flag: 'wx' })
  try {
    await fs.rename(temp, file)
  } catch (error) {
    await fs.rm(temp, { force: true })
    throw error
  }
}

export async function validateCanvas(
  server: ViteDevServer,
  absoluteCanvasPath: string,
): Promise<void> {
  const url = `/@fs/${absoluteCanvasPath}`
  const module = server.moduleGraph.getModuleById(absoluteCanvasPath)
  if (module) server.moduleGraph.invalidateModule(module)
  const transformed = await server.transformRequest(url)
  if (!transformed) {
    throw new Error('Vite could not transform the Canvas.')
  }
}

export function createCanvasRepair(
  aiConfig: AiConfig,
): (request: RepairRequest) => Promise<CandidateFile[]> {
  const model = createModel(aiConfig)
  return async (request) => {
    const candidatePaths = request.candidateFiles.map(
      (file) => file.path,
    )
    if (
      candidatePaths.length === 0 ||
      new Set(candidatePaths).size !== candidatePaths.length
    ) {
      throw new InvalidCandidateSetError()
    }
    const candidatePathSchema = z.enum(
      candidatePaths as [string, ...string[]],
    )
    const schema = z.object({
      files: z
        .array(
          z.object({
            path: candidatePathSchema,
            source: z.string(),
          }),
        )
        .length(candidatePaths.length),
    })
    const result = await generateObject({
      model,
      schema,
      prompt: [
        'Repair the complete candidate file set so the current Canvas passes validation.',
        'Return every candidate path exactly once. Do not add, remove, or rename files.',
        `Repair attempt: ${request.attempt}`,
        `Validation diagnostic:\n${request.diagnostic}`,
        `Candidate files:\n${JSON.stringify(request.candidateFiles)}`,
      ].join('\n\n'),
    })
    const repaired = result.object.files
    assertCandidateSet(repaired, candidatePaths)
    return repaired
  }
}

export async function applyProposalTransaction({
  proposal,
  reloadContext,
  writeAtomically: writer,
  validate,
  repair,
  onStatus,
}: ApplyProposalTransactionInput): Promise<ApplyResult> {
  onStatus({ phase: 'checking' })
  let context: CanvasAuthoringContext
  let targets: CandidateTarget[]
  try {
    context = await reloadContext()
    targets = baselineTargets(proposal, context)
  } catch {
    return {
      ok: false,
      proposalId: proposal.id,
      error: BASELINE_CHANGED_ERROR,
      rolledBack: true,
    }
  }

  const canvasRelativePath = `canvases/${context.canvas.component}`
  const canvasFile = context.files.find(
    (file) =>
      file.relativePath === canvasRelativePath &&
      file.permission === 'write-existing',
  )
  if (!canvasFile) {
    return {
      ok: false,
      proposalId: proposal.id,
      error: BASELINE_CHANGED_ERROR,
      rolledBack: true,
    }
  }

  const originalCandidatePaths = proposal.candidateFiles.map(
    (file) => file.path,
  )
  const targetsByPath = new Map(
    targets.map((target) => [target.path, target]),
  )
  let candidates = proposal.candidateFiles
  let repairAttempts = 0
  const writtenTargetPaths = new Set<string>()

  const rollback = () =>
    rollbackTargets(
      targets.filter((target) =>
        writtenTargetPaths.has(target.path),
      ),
      writer,
    )
  const applyCandidateSet = async (
    candidateSet: CandidateFile[],
  ): Promise<void> => {
    assertCandidateSet(candidateSet, originalCandidatePaths)
    onStatus({ phase: 'writing' })
    for (const candidate of candidateSet) {
      const target = targetsByPath.get(candidate.path)
      if (!target) throw new InvalidCandidateSetError()
      await writer(target.absolutePath, candidate.source)
      writtenTargetPaths.add(target.path)
    }
  }

  try {
    for (;;) {
      await applyCandidateSet(candidates)
      onStatus({ phase: 'validating' })
      try {
        await validate(canvasFile.absolutePath)
        return {
          ok: true,
          proposalId: proposal.id,
          repairAttempts,
        }
      } catch (error) {
        if (repairAttempts === 2) {
          await rollback()
          return {
            ok: false,
            proposalId: proposal.id,
            error: VALIDATION_FAILED_ERROR,
            rolledBack: true,
          }
        }
        repairAttempts += 1
        const attempt = repairAttempts as 1 | 2
        onStatus({ phase: 'repairing', attempt })
        candidates = await repair({
          attempt,
          diagnostic: compactDiagnostic(error),
          candidateFiles: candidates,
        })
        assertCandidateSet(candidates, originalCandidatePaths)
      }
    }
  } catch (error) {
    if (writtenTargetPaths.size > 0) await rollback()
    return {
      ok: false,
      proposalId: proposal.id,
      error:
        error instanceof InvalidCandidateSetError
          ? INVALID_REPAIR_ERROR
          : APPLY_FAILED_ERROR,
      rolledBack: true,
    }
  }
}

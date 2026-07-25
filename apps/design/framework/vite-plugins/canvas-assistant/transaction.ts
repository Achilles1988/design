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
import {
  validateCandidateDependencies,
  type StoredProposal,
} from './proposals'

const BASELINE_CHANGED_ERROR =
  'The Canvas changed after this proposal was created. Generate a new proposal.'
const INVALID_REPAIR_ERROR =
  'Canvas repair returned an invalid candidate set.'
const VALIDATION_FAILED_ERROR =
  'Canvas validation failed after two repair attempts.'
const APPLY_FAILED_ERROR = 'Canvas proposal could not be applied.'
export const ROLLBACK_INCOMPLETE_ERROR =
  'Canvas proposal rollback was incomplete. Some files may need manual inspection.'
const MAX_DIAGNOSTIC_LENGTH = 8_000
const CREDENTIAL_LABEL =
  String.raw`(?:[A-Za-z_][A-Za-z0-9_]*(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET_KEY)|api[-_ ]?key|authorization)`
const CREDENTIAL_LABEL_FORM =
  String.raw`(?:"${CREDENTIAL_LABEL}"|'${CREDENTIAL_LABEL}'|\b${CREDENTIAL_LABEL}\b)`
const CREDENTIAL_VALUE =
  String.raw`(?:"(?:Bearer\s+)?[^"\r\n]*"|'(?:Bearer\s+)?[^'\r\n]*'|Bearer\s+[^\s,;]+|[^\s,;]+)`
const CREDENTIAL_ASSIGNMENT_PATTERN = new RegExp(
  String.raw`${CREDENTIAL_LABEL_FORM}\s*[:=]\s*${CREDENTIAL_VALUE}`,
  'gi',
)
const DIAGNOSTIC_BOUNDARY =
  String.raw`(?:(?:[A-Za-z][A-Za-z0-9_.-]*Error|Error)\s*:|TS\d+\s*:|(?:Transform|Build|Compilation)\s+(?:failed|error)\b|(?:Cannot|Could not|Failed to)\s+resolve\b|\[(?:vite[^\]]*|plugin:[^\]]*)\])`
const PROMPT_BLOCK_PATTERN = new RegExp(
  String.raw`\bPrompt\s*:[^\r\n]*(?:\r?\n(?!\s*${DIAGNOSTIC_BOUNDARY})[^\r\n]*)*`,
  'gi',
)
const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s,;)"']+/gi

export type CandidateFile = StoredProposal['candidateFiles'][number]

export type RepairRequest = {
  attempt: 1 | 2
  diagnostic: string
  candidateFiles: CandidateFile[]
  originalUserIntent: string
  styleContract: {
    id: string
    source: string
  }
  layoutDecision:
    | {
        kind: 'installed'
        id: string
        reason: string
        contractSource: string
      }
    | {
        kind: 'temporary'
        reason: string
      }
  preservationConstraints: string[]
}

export type ApplyResult =
  | { ok: true; proposalId: string; repairAttempts: number }
  | {
      ok: false
      proposalId: string
      error: string
      rolledBack: boolean
    }

export type ApplyStatusEvent = {
  phase: 'checking' | 'writing' | 'validating' | 'repairing'
  attempt?: 1 | 2
}

export type CandidateValidationTarget = {
  path: string
  absolutePath: string
}

type ApplyProposalTransactionInput = {
  proposal: StoredProposal
  reloadContext: () => Promise<CanvasAuthoringContext>
  writeAtomically: (
    absolutePath: string,
    source: string,
  ) => Promise<void>
  validate: (targets: CandidateValidationTarget[]) => Promise<void>
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

type TrustedRepairContext = Pick<
  RepairRequest,
  | 'originalUserIntent'
  | 'styleContract'
  | 'layoutDecision'
  | 'preservationConstraints'
>

function trustedRepairContext(
  proposal: StoredProposal,
  context: CanvasAuthoringContext,
): TrustedRepairContext {
  const trusted = proposal.trusted
  if (
    !trusted ||
    context.appConfigHash !== trusted.appConfigHash ||
    context.style.id !== trusted.styleContract.id ||
    context.style.hash !== trusted.styleContract.hash ||
    trusted.constraints.styleId !== trusted.styleContract.id ||
    !trusted.originalUserIntent
  ) {
    throw new Error(BASELINE_CHANGED_ERROR)
  }

  const layout = trusted.constraints.layout
  let layoutDecision: TrustedRepairContext['layoutDecision']
  if (layout.kind === 'installed') {
    const fingerprint = trusted.selectedLayoutContract
    const currentContract = context.installedLayouts.find(
      (contract) => contract.id === layout.id,
    )
    if (
      !fingerprint ||
      fingerprint.id !== layout.id ||
      !currentContract ||
      currentContract.hash !== fingerprint.hash
    ) {
      throw new Error(BASELINE_CHANGED_ERROR)
    }
    layoutDecision = {
      kind: 'installed',
      id: layout.id,
      reason: layout.reason,
      contractSource: currentContract.source,
    }
  } else {
    if (trusted.selectedLayoutContract !== null) {
      throw new Error(BASELINE_CHANGED_ERROR)
    }
    layoutDecision = {
      kind: 'temporary',
      reason: layout.reason,
    }
  }

  return {
    originalUserIntent: trusted.originalUserIntent,
    styleContract: {
      id: context.style.id,
      source: context.style.source,
    },
    layoutDecision,
    preservationConstraints: [...trusted.constraints.preserved],
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

function redactAbsolutePaths(value: string): string {
  return value
    .replace(
      /(["'])(?:[A-Za-z]:[\\/]|\/)[^\r\n]*?\1/g,
      '[absolute path]',
    )
    .replace(
      /(?:[A-Za-z]:[\\/]|(?<![.:/\\\w])\/)[^\r\n,;)"']*?\.[A-Za-z0-9_-]+(?=:\d|:\s|[\s,;)"']|$)/g,
      '[absolute path]',
    )
    .replace(
      /(?:[A-Za-z]:[\\/]|(?<![.:/\\\w])\/)[^\r\n,;)"']+?(?=:\s|[,;)"']|$)/g,
      '[absolute path]',
    )
    .replace(
      /(?:[A-Za-z]:[\\/]|(?<![.:/\\\w])\/)[^\s\r\n,;:)"']+/g,
      '[absolute path]',
    )
}

const FILESYSTEM_PARAMETER_NAMES = new Set([
  'file',
  'filename',
  'filepath',
  'path',
  'source',
  'sourcefile',
])

function decodeUrlComponent(value: string): string {
  let decodedValue = value

  while (true) {
    try {
      const nextValue = decodeURIComponent(decodedValue)
      if (nextValue === decodedValue) {
        return decodedValue
      }
      decodedValue = nextValue
    } catch {
      return decodedValue
    }
  }
}

function isFilesystemParameter(name: string): boolean {
  const normalizedName = decodeUrlComponent(name)
    .replace(/[-_.]/g, '')
    .toLowerCase()
  return FILESYSTEM_PARAMETER_NAMES.has(normalizedName)
}

function startsWithLocalAbsolutePath(
  value: string,
  allowAnyUnixRoot: boolean,
): boolean {
  const decodedValue = decodeUrlComponent(value)
  if (/^[A-Za-z]:[\\/]/.test(decodedValue)) {
    return true
  }
  if (!/^\/(?!\/)/.test(decodedValue)) {
    return false
  }
  return allowAnyUnixRoot
}

function redactUrlParameterSection(section: string): string {
  return section
    .split('&')
    .map((parameter) => {
      const separatorIndex = parameter.indexOf('=')
      if (separatorIndex === -1) {
        return startsWithLocalAbsolutePath(parameter, false)
          ? '[absolute path]'
          : parameter
      }

      const name = parameter.slice(0, separatorIndex)
      const value = parameter.slice(separatorIndex + 1)
      return (
        `${name}=` +
        (startsWithLocalAbsolutePath(
          value,
          isFilesystemParameter(name),
        )
          ? '[absolute path]'
          : value)
      )
    })
    .join('&')
}

function redactPathsInsideHttpUrl(value: string): string {
  const fragmentIndex = value.indexOf('#')
  const beforeFragment =
    fragmentIndex === -1 ? value : value.slice(0, fragmentIndex)
  const fragment =
    fragmentIndex === -1 ? undefined : value.slice(fragmentIndex + 1)
  const queryIndex = beforeFragment.indexOf('?')
  let baseUrl =
    queryIndex === -1
      ? beforeFragment
      : beforeFragment.slice(0, queryIndex)
  const query =
    queryIndex === -1
      ? undefined
      : beforeFragment.slice(queryIndex + 1)
  const viteFsMarker = '/@fs/'
  const viteFsIndex = baseUrl.indexOf(viteFsMarker)

  if (viteFsIndex !== -1) {
    const pathIndex = viteFsIndex + viteFsMarker.length
    const viteFsPath = baseUrl.slice(pathIndex)
    if (startsWithLocalAbsolutePath(viteFsPath, true)) {
      baseUrl = `${baseUrl.slice(0, pathIndex)}[absolute path]`
    }
  }

  return (
    baseUrl +
    (query === undefined
      ? ''
      : `?${redactUrlParameterSection(query)}`) +
    (fragment === undefined
      ? ''
      : `#${redactUrlParameterSection(fragment)}`)
  )
}

function redactPathsOutsideHttpUrls(value: string): string {
  let result = ''
  let cursor = 0
  for (const match of value.matchAll(HTTP_URL_PATTERN)) {
    result += redactAbsolutePaths(value.slice(cursor, match.index))
    result += redactPathsInsideHttpUrl(match[0])
    cursor = match.index + match[0].length
  }
  return result + redactAbsolutePaths(value.slice(cursor))
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
    .replace(CREDENTIAL_ASSIGNMENT_PATTERN, '[credential]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[credential]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[credential]')
    .replace(PROMPT_BLOCK_PATTERN, 'Prompt: [redacted]')
  return redactPathsOutsideHttpUrls(sanitized).slice(
    0,
    MAX_DIAGNOSTIC_LENGTH,
  )
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
    (
      entry,
    ): entry is typeof entry & {
      operation: 'write-existing' | 'create-shared'
    } => entry.operation !== 'read-only',
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
): Promise<boolean> {
  const results = await Promise.allSettled(
    targets.map((target) =>
      Promise.resolve().then(() =>
        target.operation === 'write-existing'
          ? writer(target.absolutePath, target.originalSource ?? '')
          : fs.rm(target.absolutePath, { force: true }),
      ),
    ),
  )
  return results.every(
    (result) => result.status === 'fulfilled',
  )
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
  targets: CandidateValidationTarget[],
): Promise<void> {
  const sortedTargets = [...targets].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )
  for (const target of sortedTargets) {
    const url = `/@fs/${target.absolutePath}`
    const module = server.moduleGraph.getModuleById(
      target.absolutePath,
    )
    if (module) server.moduleGraph.invalidateModule(module)
    try {
      const transformed = await server.transformRequest(url)
      if (!transformed) {
        throw new Error('Vite returned an empty transform result.')
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      throw new Error(
        `Vite could not transform candidate "${target.path}": ${message}`,
      )
    }
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
        `Original user intent:\n${request.originalUserIntent}`,
        `Trusted Style contract (${request.styleContract.id}):\n${request.styleContract.source}`,
        request.layoutDecision.kind === 'installed'
          ? `Trusted installed Layout contract (${request.layoutDecision.id}; ${request.layoutDecision.reason}):\n${request.layoutDecision.contractSource}`
          : `Trusted temporary Layout decision:\n${request.layoutDecision.reason}`,
        `Preservation constraints:\n${JSON.stringify(request.preservationConstraints)}`,
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
  let repairContext: TrustedRepairContext
  try {
    context = await reloadContext()
    repairContext = trustedRepairContext(proposal, context)
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
  const validationTargetsByPath = new Map<
    string,
    CandidateValidationTarget
  >()
  for (const target of targets) {
    if (/\.(?:css|tsx?)$/.test(target.path)) {
      validationTargetsByPath.set(target.path, {
        path: target.path,
        absolutePath: target.absolutePath,
      })
    }
  }
  if (!validationTargetsByPath.has(canvasRelativePath)) {
    validationTargetsByPath.set(canvasRelativePath, {
      path: canvasRelativePath,
      absolutePath: canvasFile.absolutePath,
    })
  }
  const validationTargets = [...validationTargetsByPath.values()].sort(
    (left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
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
    validateCandidateDependencies(
      context,
      candidateSet,
      proposal.card.reusedComponents,
    )
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
        await validate(validationTargets)
        return {
          ok: true,
          proposalId: proposal.id,
          repairAttempts,
        }
      } catch (error) {
        if (repairAttempts === 2) {
          const rolledBack = await rollback()
          return {
            ok: false,
            proposalId: proposal.id,
            error: rolledBack
              ? VALIDATION_FAILED_ERROR
              : ROLLBACK_INCOMPLETE_ERROR,
            rolledBack,
          }
        }
        repairAttempts += 1
        const attempt = repairAttempts as 1 | 2
        onStatus({ phase: 'repairing', attempt })
        candidates = await repair({
          attempt,
          diagnostic: compactDiagnostic(error),
          candidateFiles: candidates,
          ...repairContext,
        })
        assertCandidateSet(candidates, originalCandidatePaths)
      }
    }
  } catch (error) {
    const rolledBack =
      writtenTargetPaths.size === 0 ? true : await rollback()
    return {
      ok: false,
      proposalId: proposal.id,
      error:
        !rolledBack
          ? ROLLBACK_INCOMPLETE_ERROR
          : error instanceof InvalidCandidateSetError
          ? INVALID_REPAIR_ERROR
          : APPLY_FAILED_ERROR,
      rolledBack,
    }
  }
}

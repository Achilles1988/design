import { randomUUID } from 'node:crypto'
import path from 'node:path'
import ts from 'typescript'
import {
  CanvasProposalCardArgsSchema,
  RawCanvasProposalSchema,
  type CanvasProposalCardArgs,
  type RawCanvasProposal,
  type StyleSlotIds,
} from '../../src/lib/canvasAssistantProtocol'
import type { StyleSlot } from '../../src/lib/styleSlots'
import {
  STYLE_SLOTS,
  validateCandidatePath,
  type CandidateOperation,
  type CanvasAuthoringContext,
} from './context'

export const PROPOSAL_TTL_MS = 30 * 60 * 1000
const MAX_ORIGINAL_USER_INTENT_LENGTH = 4_000
const INTENT_CREDENTIAL_LABEL =
  String.raw`(?:[A-Za-z_][A-Za-z0-9_]*(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET_KEY)|api[-_ ]?key|authorization)`
const INTENT_CREDENTIAL_VALUE =
  String.raw`(?:"(?:Bearer\s+)?[^"\r\n]*"|'(?:Bearer\s+)?[^'\r\n]*'|Bearer\s+[^\s,;]+|[^\s,;]+)`
const INTENT_CREDENTIAL_PATTERN = new RegExp(
  String.raw`(?:"${INTENT_CREDENTIAL_LABEL}"|'${INTENT_CREDENTIAL_LABEL}'|\b${INTENT_CREDENTIAL_LABEL}\b)\s*[:=]\s*${INTENT_CREDENTIAL_VALUE}`,
  'gi',
)

export type StyleContractFingerprints = Partial<
  Record<StyleSlot, { id: string; hash: string }>
>

export type TrustedProposalContext = {
  appConfigHash: string
  styleContracts: StyleContractFingerprints
  selectedLayoutContract: {
    id: string
    hash: string
  } | null
  originalUserIntent: string
  constraints: {
    styleIds: StyleSlotIds
    layout: RawCanvasProposal['layout']
    preserved: string[]
  }
}

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
  trusted: TrustedProposalContext
  card: CanvasProposalCardArgs
}

type ProposalStoreOptions = {
  now: () => number
  ttlMs: number
}

export function sanitizeOriginalUserIntent(value: string): string {
  const sanitized = value
    .replace(INTENT_CREDENTIAL_PATTERN, '[credential]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[credential]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[credential]')
    .slice(0, MAX_ORIGINAL_USER_INTENT_LENGTH)
    .trim()
  return sanitized || '[redacted]'
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

function styleSlotIds(context: CanvasAuthoringContext): StyleSlotIds {
  const ids: StyleSlotIds = {}
  for (const slot of STYLE_SLOTS) {
    const contract = context.styles[slot]
    if (contract) ids[slot] = contract.id
  }
  return ids
}

function styleContractFingerprints(
  context: CanvasAuthoringContext,
): StyleContractFingerprints {
  const fingerprints: StyleContractFingerprints = {}
  for (const slot of STYLE_SLOTS) {
    const contract = context.styles[slot]
    if (contract) {
      fingerprints[slot] = { id: contract.id, hash: contract.hash }
    }
  }
  return fingerprints
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

function relativeImportTargets(
  importerPath: string,
  moduleSpecifier: string,
): string[] {
  if (
    !moduleSpecifier.startsWith('./') &&
    !moduleSpecifier.startsWith('../')
  ) {
    return []
  }
  const resolved = path.posix.normalize(
    path.posix.join(
      path.posix.dirname(importerPath),
      moduleSpecifier,
    ),
  )
  return [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.css`,
    path.posix.join(resolved, 'index.ts'),
    path.posix.join(resolved, 'index.tsx'),
    path.posix.join(resolved, 'index.css'),
  ]
}

function isBarePackageImport(moduleSpecifier: string): boolean {
  if (
    moduleSpecifier.includes('\\') ||
    moduleSpecifier.includes('%')
  ) {
    return false
  }
  const segments = moduleSpecifier.split('/')
  if (
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..',
    )
  ) {
    return false
  }
  const packageSegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
  const subpathSegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
  if (segments[0]?.startsWith('@')) {
    if (segments.length < 2) return false
    if (
      !/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
        segments[0],
      ) ||
      !packageSegment.test(segments[1])
    ) {
      return false
    }
    return segments.slice(2).every((segment) =>
      subpathSegment.test(segment),
    )
  }
  return (
    packageSegment.test(segments[0] ?? '') &&
    segments.slice(1).every((segment) =>
      subpathSegment.test(segment),
    )
  )
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression
  }
  return current
}

function isImportMeta(expression: ts.Expression): boolean {
  const current = unwrapParentheses(expression)
  return (
    ts.isMetaProperty(current) &&
    current.keywordToken === ts.SyntaxKind.ImportKeyword &&
    current.name.text === 'meta'
  )
}

function viteGlobName(expression: ts.Expression): string | null {
  const current = unwrapParentheses(expression)
  if (
    ts.isPropertyAccessExpression(current) &&
    isImportMeta(current.expression)
  ) {
    return current.name.text
  }
  if (
    ts.isElementAccessExpression(current) &&
    isImportMeta(current.expression) &&
    current.argumentExpression &&
    (ts.isStringLiteral(current.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(
        current.argumentExpression,
      ))
  ) {
    return current.argumentExpression.text
  }
  return null
}

function assertSafeAstDependencies(
  filePath: string,
  source: string,
): void {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.posix.extname(filePath) === '.tsx'
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  )
  let validationError: string | null = null
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        !(
          node.arguments.length === 1 &&
          (ts.isStringLiteral(node.arguments[0]) ||
            ts.isNoSubstitutionTemplateLiteral(
              node.arguments[0],
            ))
        )
      ) {
        validationError = 'Candidate import is not allowed.'
        return
      }
      if (
        ['glob', 'globEager'].includes(
        viteGlobName(node.expression) ?? '',
        )
      ) {
        validationError =
          'Candidate Vite glob imports are not allowed.'
        return
      }
    }
    if (!validationError) ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (validationError) throw new Error(validationError)
}

function readCssEscape(
  source: string,
  start: number,
): { value: string; next: number } {
  const first = source[start + 1]
  if (first === undefined) return { value: '', next: start + 1 }
  if (/[0-9A-Fa-f]/.test(first)) {
    let end = start + 1
    while (
      end < source.length &&
      end < start + 7 &&
      /[0-9A-Fa-f]/.test(source[end] ?? '')
    ) {
      end += 1
    }
    const codePoint = Number.parseInt(
      source.slice(start + 1, end),
      16,
    )
    if (/\s/.test(source[end] ?? '')) {
      if (source[end] === '\r' && source[end + 1] === '\n') {
        end += 2
      } else {
        end += 1
      }
    }
    const validCodePoint =
      codePoint === 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? 0xfffd
        : codePoint
    return {
      value: String.fromCodePoint(validCodePoint),
      next: end,
    }
  }
  if (first === '\r' && source[start + 2] === '\n') {
    return { value: '', next: start + 3 }
  }
  if (first === '\n' || first === '\r' || first === '\f') {
    return { value: '', next: start + 2 }
  }
  return { value: first, next: start + 2 }
}

function skipCssString(source: string, start: number): number {
  const quote = source[start]
  let cursor = start + 1
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor = readCssEscape(source, cursor).next
      continue
    }
    if (source[cursor] === quote) return cursor + 1
    if (
      source[cursor] === '\n' ||
      source[cursor] === '\r' ||
      source[cursor] === '\f'
    ) {
      return cursor
    }
    cursor += 1
  }
  return cursor
}

function assertNoCssImports(source: string): void {
  let cursor = 0
  while (cursor < source.length) {
    if (source.startsWith('/*', cursor)) {
      const commentEnd = source.indexOf('*/', cursor + 2)
      cursor =
        commentEnd === -1 ? source.length : commentEnd + 2
      continue
    }
    if (source[cursor] === '"' || source[cursor] === "'") {
      cursor = skipCssString(source, cursor)
      continue
    }
    if (source[cursor] !== '@') {
      cursor += 1
      continue
    }

    let name = ''
    let nameCursor = cursor + 1
    while (nameCursor < source.length) {
      const character = source[nameCursor] ?? ''
      if (/[A-Za-z0-9_-]/.test(character)) {
        name += character
        nameCursor += 1
        continue
      }
      if (character === '\\') {
        const escaped = readCssEscape(source, nameCursor)
        name += escaped.value
        nameCursor = escaped.next
        continue
      }
      break
    }
    if (name.toLowerCase() === 'import') {
      throw new Error('Candidate CSS imports are not allowed.')
    }
    cursor = Math.max(nameCursor, cursor + 1)
  }
}

export function validateCandidateDependencies(
  context: CanvasAuthoringContext,
  candidateFiles: Array<{ path: string; source: string }>,
  reusedComponents: string[],
): void {
  const readOnlyPaths = new Set(
    context.files
      .filter((file) => file.permission === 'read-only')
      .map((file) => file.relativePath),
  )
  if (
    reusedComponents.some(
      (componentPath) => !readOnlyPaths.has(componentPath),
    )
  ) {
    throw new Error(
      'Reused components must be discovered read-only components.',
    )
  }
  const candidateComponentPaths = new Set(
    candidateFiles
      .map((file) => file.path)
      .filter((candidatePath) =>
        candidatePath.startsWith('components/'),
      ),
  )
  const canvasPath = `canvases/${context.canvas.component}`
  const currentCssPaths = new Set(
    context.files
      .filter(
        (file) =>
          file.permission === 'write-existing' &&
          path.posix.extname(file.relativePath) === '.css' &&
          path.posix.dirname(file.relativePath) ===
            path.posix.dirname(canvasPath),
      )
      .map((file) => file.relativePath),
  )
  const allowedRelativePaths = new Set([
    ...readOnlyPaths,
    ...candidateComponentPaths,
    ...currentCssPaths,
  ])
  const imported = new Set<string>()

  for (const file of candidateFiles) {
    const extension = path.posix.extname(file.path)
    if (extension === '.css') {
      assertNoCssImports(file.source)
      continue
    }
    if (!['.ts', '.tsx'].includes(extension)) {
      continue
    }
    assertSafeAstDependencies(file.path, file.source)
    const imports = ts.preProcessFile(file.source, true, true)
      .importedFiles
    for (const importedFile of imports) {
      const moduleSpecifier = importedFile.fileName
      if (isBarePackageImport(moduleSpecifier)) continue

      const targets = relativeImportTargets(
        file.path,
        moduleSpecifier,
      ).filter((candidate) => allowedRelativePaths.has(candidate))
      if (targets.length !== 1) {
        throw new Error('Candidate import is not allowed.')
      }
      const target = targets[0]
      if (readOnlyPaths.has(target)) {
        imported.add(target)
        continue
      }
      if (candidateComponentPaths.has(target)) continue
      if (
        currentCssPaths.has(target) &&
        file.path === canvasPath
      ) {
        continue
      }
      throw new Error('Candidate import is not allowed.')
    }
  }

  if (!exactlyMatches(reusedComponents, [...imported])) {
    throw new Error(
      'Reused components must exactly match imported read-only components.',
    )
  }
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
    originalUserIntent: string,
  ): CanvasProposalCardArgs {
    const raw = RawCanvasProposalSchema.parse(rawToolArgs)
    const candidatePaths = raw.files.map((file) => file.path)
    const appDir = path.dirname(context.componentsDir)
    const candidateTargets = candidatePaths.map((candidatePath) =>
      path
        .resolve(appDir, candidatePath)
        .normalize('NFC')
        .toLowerCase(),
    )
    if (
      new Set(candidateTargets).size !== candidateTargets.length
    ) {
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

    validateCandidateDependencies(
      context,
      raw.files,
      raw.reusedComponents,
    )

    if (
      raw.layout.kind === 'installed' &&
      !context.app.layouts.includes(raw.layout.id)
    ) {
      throw new Error('The selected Layout is not installed.')
    }
    const selectedLayoutId =
      raw.layout.kind === 'installed' ? raw.layout.id : null
    const selectedLayoutContract = selectedLayoutId
      ? context.installedLayouts.find(
          (contract) => contract.id === selectedLayoutId,
        )
      : null
    if (raw.layout.kind === 'installed' && !selectedLayoutContract) {
      throw new Error(
        'The selected Layout contract could not be loaded.',
      )
    }

    const createdAt = now()
    const expiresAt = createdAt + ttlMs
    const id = randomUUID()
    const card = CanvasProposalCardArgsSchema.parse({
      proposalId: id,
      mode: raw.mode,
      summary: raw.summary,
      styleIds: styleSlotIds(context),
      layout: raw.layout,
      changedFiles: candidatePaths,
      reusedComponents: raw.reusedComponents,
      newSharedComponents: raw.newSharedComponents,
      preserved: raw.preserved,
      validationChecks: raw.validationChecks,
      candidateFiles: raw.files.map((file) => ({ ...file })),
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
      trusted: {
        appConfigHash: context.appConfigHash,
        styleContracts: styleContractFingerprints(context),
        selectedLayoutContract: selectedLayoutContract
          ? {
              id: selectedLayoutContract.id,
              hash: selectedLayoutContract.hash,
            }
          : null,
        originalUserIntent:
          sanitizeOriginalUserIntent(originalUserIntent),
        constraints: {
          styleIds: styleSlotIds(context),
          layout: { ...raw.layout },
          preserved: [...raw.preserved],
        },
      },
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
    return structuredClone(proposal)
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

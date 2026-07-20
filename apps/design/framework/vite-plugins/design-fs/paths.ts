import path from 'node:path'

export function resolveContentPath(
  contentRoot: string,
  ...segments: string[]
): string {
  const root = path.resolve(contentRoot)
  const resolved = path.resolve(root, ...segments)
  const rel = path.relative(root, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path escapes content root')
  }
  return resolved
}

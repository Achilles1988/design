export function validatePathMeta(
  path: string | undefined,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (path === undefined) return { ok: true }
  const trimmed = path.trim()
  if (!trimmed) return { ok: true }
  if (trimmed.includes('..')) {
    return { ok: false, error: 'path must not contain ..' }
  }
  if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: 'path must be a relative path' }
  }
  return { ok: true, value: trimmed }
}

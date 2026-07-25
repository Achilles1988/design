const STORAGE_KEY = 'wn.canvas.rename-notice.v1'

export type CanvasRenameNotice = {
  appId: string
  fromId: string
  toId: string
  name: string
}

function isCanvasRenameNotice(value: unknown): value is CanvasRenameNotice {
  if (!value || typeof value !== 'object') return false
  const notice = value as Record<string, unknown>
  return (
    typeof notice.appId === 'string' &&
    typeof notice.fromId === 'string' &&
    typeof notice.toId === 'string' &&
    typeof notice.name === 'string'
  )
}

export function writeCanvasRenameNotice(notice: CanvasRenameNotice): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notice))
}

export function readCanvasRenameNotice(
  appId: string,
  canvasId: string,
): CanvasRenameNotice | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isCanvasRenameNotice(parsed)) return null
    if (parsed.appId !== appId || parsed.fromId !== canvasId) return null
    return parsed
  } catch {
    return null
  }
}

export function clearCanvasRenameNotice(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

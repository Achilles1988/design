export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'design-engineering-theme'

type ThemeListener = (mode: ThemeMode) => void

const listeners = new Set<ThemeListener>()

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function readStorage(): ThemeMode | null {
  try {
    const raw = globalThis.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(raw) ? raw : null
  } catch {
    return null
  }
}

function writeStorage(mode: ThemeMode): void {
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // ignore quota / private-mode failures
  }
}

function applyDom(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode)
}

export function getTheme(): ThemeMode {
  const fromDom = document.documentElement.getAttribute('data-theme')
  if (isThemeMode(fromDom)) return fromDom
  return readStorage() ?? 'dark'
}

/** Apply stored theme (or dark default) on shell boot. */
export function initTheme(): ThemeMode {
  const mode = readStorage() ?? 'dark'
  applyDom(mode)
  return mode
}

export function setTheme(mode: ThemeMode): void {
  writeStorage(mode)
  applyDom(mode)
  for (const listener of listeners) listener(mode)
}

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Same-origin iframe preview sync (layout/rule packages). */
export function applyThemeToFrame(
  frame: HTMLIFrameElement,
  mode: ThemeMode = getTheme(),
): void {
  try {
    frame.contentDocument?.documentElement.setAttribute('data-theme', mode)
  } catch {
    // ignore cross-origin frames
  }
}

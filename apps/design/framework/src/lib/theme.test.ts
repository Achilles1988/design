import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyThemeToFrame,
  getTheme,
  initTheme,
  setTheme,
  subscribeTheme,
} from './theme'

function installDomMocks() {
  const store = new Map<string, string>()
  const attrs = new Map<string, string>()

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  })

  vi.stubGlobal('document', {
    documentElement: {
      getAttribute: (key: string) => attrs.get(key) ?? null,
      setAttribute: (key: string, value: string) => {
        attrs.set(key, value)
      },
      removeAttribute: (key: string) => {
        attrs.delete(key)
      },
    },
  })

  return { store, attrs }
}

describe('theme', () => {
  beforeEach(() => {
    installDomMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to dark and writes data-theme', () => {
    expect(initTheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(getTheme()).toBe('dark')
  })

  it('persists light mode to localStorage', () => {
    setTheme('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('notifies subscribers when theme changes', () => {
    const seen: string[] = []
    const unsub = subscribeTheme((mode) => {
      seen.push(mode)
    })
    setTheme('light')
    setTheme('dark')
    unsub()
    setTheme('light')
    expect(seen).toEqual(['light', 'dark'])
  })

  it('writes data-theme onto a same-origin iframe documentElement', () => {
    const frameAttrs = new Map<string, string>()
    const frame = {
      contentDocument: {
        documentElement: {
          setAttribute: (key: string, value: string) => {
            frameAttrs.set(key, value)
          },
        },
      },
    } as unknown as HTMLIFrameElement

    applyThemeToFrame(frame, 'light')
    expect(frameAttrs.get('data-theme')).toBe('light')
  })
})

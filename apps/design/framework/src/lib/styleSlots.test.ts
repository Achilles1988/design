import { describe, expect, it } from 'vitest'
import {
  displayStyleForTheme,
  normalizeStyleSlots,
  resolveStyleForPreview,
} from './styleSlots'

describe('normalizeStyleSlots', () => {
  it('keeps non-empty light/dark ids', () => {
    expect(normalizeStyleSlots({ light: 'default', dark: 'dashboard' })).toEqual({
      light: 'default',
      dark: 'dashboard',
    })
  })

  it('returns {} for missing or empty object', () => {
    expect(normalizeStyleSlots(undefined)).toEqual({})
    expect(normalizeStyleSlots({})).toEqual({})
    expect(normalizeStyleSlots({ light: '  ', dark: '' })).toEqual({})
  })

  it('rejects legacy string style', () => {
    expect(() => normalizeStyleSlots('dashboard')).toThrow(/object/i)
  })
})

describe('resolveStyleForPreview', () => {
  it('prefers theme slot then falls back', () => {
    expect(
      resolveStyleForPreview({ light: 'a', dark: 'b' }, 'light'),
    ).toBe('a')
    expect(resolveStyleForPreview({ dark: 'b' }, 'light')).toBe('b')
    expect(resolveStyleForPreview({}, 'dark')).toBeUndefined()
  })
})

describe('displayStyleForTheme', () => {
  it('does not fall back', () => {
    expect(displayStyleForTheme({ dark: 'b' }, 'light')).toBeUndefined()
    expect(displayStyleForTheme({ dark: 'b' }, 'dark')).toBe('b')
  })
})

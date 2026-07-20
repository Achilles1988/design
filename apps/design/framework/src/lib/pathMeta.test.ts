import { describe, expect, it } from 'vitest'
import { validatePathMeta } from './pathMeta'

describe('validatePathMeta', () => {
  it('allows undefined / empty as absent', () => {
    expect(validatePathMeta(undefined)).toEqual({ ok: true })
    expect(validatePathMeta('')).toEqual({ ok: true })
    expect(validatePathMeta('  ')).toEqual({ ok: true })
  })
  it('accepts relative paths', () => {
    expect(validatePathMeta('apps/orders')).toEqual({
      ok: true,
      value: 'apps/orders',
    })
  })
  it('rejects .. and absolute paths', () => {
    expect(validatePathMeta('../x').ok).toBe(false)
    expect(validatePathMeta('/abs').ok).toBe(false)
    expect(validatePathMeta('C:\\abs').ok).toBe(false)
  })
})

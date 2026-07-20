import { describe, expect, it } from 'vitest'
import { isValidAppId, slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify(' Hello World ')).toBe('hello-world')
  })
  it('returns empty for CJK-only names', () => {
    expect(slugify('订单中心')).toBe('')
  })
})

describe('isValidAppId', () => {
  it('accepts kebab ids', () => {
    expect(isValidAppId('orders')).toBe(true)
    expect(isValidAppId('order-center')).toBe(true)
  })
  it('rejects uppercase, leading digit, empty', () => {
    expect(isValidAppId('Orders')).toBe(false)
    expect(isValidAppId('1orders')).toBe(false)
    expect(isValidAppId('')).toBe(false)
  })
})

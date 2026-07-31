import { describe, expect, it } from 'vitest'
import { resolveAppliedSlot } from './resolveAppliedSlot'

describe('resolveAppliedSlot', () => {
  it('reports light when only light changed to the id', () => {
    expect(
      resolveAppliedSlot({}, { light: 'sunny' }, 'sunny'),
    ).toBe('light')
  })

  it('reports dark when only dark changed to the id', () => {
    expect(
      resolveAppliedSlot({}, { dark: 'midnight' }, 'midnight'),
    ).toBe('dark')
  })

  it('reports both when both slots changed to the id', () => {
    expect(
      resolveAppliedSlot({}, { light: 'dual', dark: 'dual' }, 'dual'),
    ).toBe('both')
  })

  it('does not report both when the other slot already held the id before this apply', () => {
    expect(
      resolveAppliedSlot(
        { dark: 'dual' },
        { light: 'dual', dark: 'dual' },
        'dual',
      ),
    ).toBe('light')
  })

  it('returns null when neither slot changed to the id', () => {
    expect(
      resolveAppliedSlot({ light: 'sunny' }, { light: 'sunny' }, 'sunny'),
    ).toBe(null)
  })
})

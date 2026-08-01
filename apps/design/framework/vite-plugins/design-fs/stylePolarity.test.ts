import { describe, expect, it } from 'vitest'
import {
  NeedsStyleSlotError,
  parseStylePolarityFromDesignMd,
  slotsForPolarity,
  slotSupported,
} from './stylePolarity'

describe('parseStylePolarityFromDesignMd', () => {
  it('detects light-only, dark-only, both tags, and neither as both', () => {
    expect(
      parseStylePolarityFromDesignMd(`---\ntags:\n- light\n---\n`),
    ).toBe('light')
    expect(
      parseStylePolarityFromDesignMd(`---\ntags:\n- dark\n---\n`),
    ).toBe('dark')
    expect(
      parseStylePolarityFromDesignMd(`---\ntags:\n- light\n- dark\n---\n`),
    ).toBe('both')
    expect(
      parseStylePolarityFromDesignMd(`---\ntags:\n- spec\n---\n`),
    ).toBe('both')
  })

  it('ignores near-matches like dark-accent', () => {
    expect(
      parseStylePolarityFromDesignMd(`---\ntags:\n- dark-accent\n---\n`),
    ).toBe('both')
  })

  it('treats missing frontmatter or missing tags key as both', () => {
    expect(parseStylePolarityFromDesignMd('# No frontmatter\n')).toBe(
      'both',
    )
    expect(
      parseStylePolarityFromDesignMd(`---\nid: sample\n---\n`),
    ).toBe('both')
  })

  it('only reads the first frontmatter block', () => {
    const source = `---\ntags:\n- light\n---\nsome body\n---\ntags:\n- dark\n---\n`
    expect(parseStylePolarityFromDesignMd(source)).toBe('light')
  })
})

describe('slotsForPolarity', () => {
  it('maps polarity to ordered StyleSlot arrays', () => {
    expect(slotsForPolarity('light')).toEqual(['light'])
    expect(slotsForPolarity('dark')).toEqual(['dark'])
    expect(slotsForPolarity('both')).toEqual(['light', 'dark'])
  })
})

describe('slotSupported', () => {
  it('slotSupported matches polarity', () => {
    expect(slotSupported('light', 'light')).toBe(true)
    expect(slotSupported('light', 'dark')).toBe(false)
    expect(slotSupported('light', 'both')).toBe(false)
    expect(slotSupported('both', 'both')).toBe(true)
  })

  it('dark polarity only supports dark', () => {
    expect(slotSupported('dark', 'dark')).toBe(true)
    expect(slotSupported('dark', 'light')).toBe(false)
    expect(slotSupported('dark', 'both')).toBe(false)
  })

  it('both polarity supports every slot', () => {
    expect(slotSupported('both', 'light')).toBe(true)
    expect(slotSupported('both', 'dark')).toBe(true)
  })
})

describe('NeedsStyleSlotError', () => {
  it('carries the offered options and an English message', () => {
    const err = new NeedsStyleSlotError(['light', 'dark', 'both'])
    expect(err).toBeInstanceOf(Error)
    expect(err.options).toEqual(['light', 'dark', 'both'])
    expect(err.message).toBe('Choose Light, Dark, or Both for this style.')
  })
})

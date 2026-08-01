import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildGeneratedBlocks,
  parseDesignMdColors,
  parseDesignMdFontSans,
} from '../../../scripts/sync-shell-tokens.mjs'

const designRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const defaultMd = readFileSync(
  join(designRoot, 'framework/public/assets/designmd/default/DESIGN.md'),
  'utf8',
)
const dashboardMd = readFileSync(
  join(designRoot, 'framework/public/assets/designmd/dashboard/DESIGN.md'),
  'utf8',
)

describe('parseDesignMdColors', () => {
  it('parses default (light) palette', () => {
    const c = parseDesignMdColors(defaultMd, 'light')
    expect(c.primary).toBe('#2f6feb')
    expect(c.surface).toBe('#fafafa')
    expect(c.text).toBe('#111111')
    expect(c.border).toBe('#e5e5e5')
    expect(c.muted).toBe('#6b6b6b')
    expect(c.success).toBe('#17a34a')
    expect(c.warning).toBe('#eab308')
    expect(c.danger).toBe('#dc2626')
    expect(c.surface2).toBe('#ffffff')
  })

  it('parses dashboard (dark) palette', () => {
    const c = parseDesignMdColors(dashboardMd, 'dark')
    expect(c.primary).toBe('#0c5cab')
    expect(c.secondary).toBe('#0a4a8a')
    expect(c.surface).toBe('#09090b')
    expect(c.text).toBe('#fafafa')
    expect(c.success).toBe('#10b981')
    expect(c.warning).toBe('#f59e0b')
    expect(c.danger).toBe('#ef4444')
  })
})

describe('parseDesignMdFontSans', () => {
  it('extracts Inter from default', () => {
    expect(parseDesignMdFontSans(defaultMd)).toContain('Inter')
  })

  it('extracts IBM Plex Sans from dashboard', () => {
    expect(parseDesignMdFontSans(dashboardMd)).toContain('IBM Plex Sans')
  })
})

describe('buildGeneratedBlocks', () => {
  it('includes both theme selectors', () => {
    const light = parseDesignMdColors(defaultMd, 'light')
    const dark = parseDesignMdColors(dashboardMd, 'dark')
    const { darkBlock, lightBlock } = buildGeneratedBlocks(
      light,
      dark,
      parseDesignMdFontSans(defaultMd),
      parseDesignMdFontSans(dashboardMd),
    )
    expect(darkBlock).toContain("[data-theme='dark']")
    expect(lightBlock).toContain("[data-theme='light']")
    expect(lightBlock).toContain('--color-primary: #2f6feb')
    expect(darkBlock).toContain('--color-primary: #0c5cab')
  })
})

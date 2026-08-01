import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SHELL_CSS_PATHS, scanShellCssViolations } from './shellCssTokens'

const frameworkSrc = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('shell CSS token compliance', () => {
  it('lists all in-scope shell css files', () => {
    expect(SHELL_CSS_PATHS).toContain('ui/ConfirmTipHost.css')
    expect(SHELL_CSS_PATHS).toContain('shell/assistant/assistant.css')
    expect(SHELL_CSS_PATHS).not.toContain('styles/tokens.css')
  })

  it('flags bare hex in sample css', () => {
    const violations = scanShellCssViolations('.btn { color: #fff; }', 'ui/x.css')
    expect(violations.some((v) => /hex/i.test(v))).toBe(true)
  })

  it('flags bare font-size px', () => {
    const violations = scanShellCssViolations('.x { font-size: 14px; }', 'ui/x.css')
    expect(violations.some((v) => /font-size/i.test(v))).toBe(true)
  })

  it('has no violations in committed shell css (gate)', () => {
    const all: string[] = []
    for (const rel of SHELL_CSS_PATHS) {
      const abs = join(frameworkSrc, rel)
      const source = readFileSync(abs, 'utf8')
      all.push(...scanShellCssViolations(source, rel).map((v) => `${rel}: ${v}`))
    }
    expect(all).toEqual([])
  })
})

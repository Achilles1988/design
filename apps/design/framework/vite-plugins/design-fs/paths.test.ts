import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveContentPath } from './paths'

describe('resolveContentPath', () => {
  const root = path.join(os.tmpdir(), 'design-content-root')

  it('joins safe segments', () => {
    const result = resolveContentPath(root, 'orders', 'app.json')
    expect(result).toBe(path.join(root, 'orders', 'app.json'))
  })

  it('rejects .. segments', () => {
    expect(() => resolveContentPath(root, '..', 'etc')).toThrow(/escapes/)
  })
})

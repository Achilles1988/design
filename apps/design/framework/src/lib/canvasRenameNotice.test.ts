// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearCanvasRenameNotice,
  readCanvasRenameNotice,
  writeCanvasRenameNotice,
} from './canvasRenameNotice'

afterEach(() => {
  clearCanvasRenameNotice()
})

describe('canvasRenameNotice', () => {
  it('returns the notice only for the old canvas id', () => {
    writeCanvasRenameNotice({
      appId: 'acme',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })
    expect(readCanvasRenameNotice('acme', 'home')).toEqual({
      appId: 'acme',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })
    expect(readCanvasRenameNotice('acme', 'landing')).toBeNull()
    expect(readCanvasRenameNotice('other', 'home')).toBeNull()
  })
})

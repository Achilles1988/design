import { describe, expect, it } from 'vitest'
import {
  computePreviewScale,
  FALLBACK_PREVIEW_SCALE,
  PREVIEW_WIDTH,
} from './previewScale'

describe('computePreviewScale', () => {
  it('scales iframe to card width relative to preview width', () => {
    expect(computePreviewScale(256)).toBeCloseTo(256 / PREVIEW_WIDTH)
    expect(computePreviewScale(PREVIEW_WIDTH)).toBe(1)
  })

  it('returns fallback when width is zero or negative', () => {
    expect(computePreviewScale(0)).toBe(FALLBACK_PREVIEW_SCALE)
    expect(computePreviewScale(-1)).toBe(FALLBACK_PREVIEW_SCALE)
  })
})

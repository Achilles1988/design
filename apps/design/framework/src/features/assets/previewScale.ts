export const PREVIEW_WIDTH = 1280
export const FALLBACK_PREVIEW_SCALE = 0.28

export function computePreviewScale(
  clientWidth: number,
  previewWidth = PREVIEW_WIDTH,
  fallback = FALLBACK_PREVIEW_SCALE,
): number {
  if (clientWidth <= 0) return fallback
  return clientWidth / previewWidth
}

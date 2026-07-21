const target = new EventTarget()

export const CANVASES_CHANGED = 'canvases-changed'

export function emitCanvasesChanged(): void {
  target.dispatchEvent(new Event(CANVASES_CHANGED))
}

export function subscribeCanvasesChanged(listener: () => void): () => void {
  target.addEventListener(CANVASES_CHANGED, listener)
  return () => target.removeEventListener(CANVASES_CHANGED, listener)
}

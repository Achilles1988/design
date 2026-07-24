type CanvasAppliedPayload = {
  appId: string
  canvasId: string
}

export type CanvasAssistantHotContext = {
  on: (
    event: 'canvas-assistant:applied',
    listener: (payload: CanvasAppliedPayload) => void,
  ) => void
  off: (
    event: 'canvas-assistant:applied',
    listener: (payload: CanvasAppliedPayload) => void,
  ) => void
}

export function subscribeCanvasApplied(
  appId: string,
  canvasId: string,
  callback: () => void,
  hot: CanvasAssistantHotContext | undefined = import.meta.hot,
): () => void {
  if (!hot) return () => undefined
  const listener = ({
    appId: changedAppId,
    canvasId: changedCanvasId,
  }: CanvasAppliedPayload) => {
    if (changedAppId === appId && changedCanvasId === canvasId) {
      callback()
    }
  }
  hot.on('canvas-assistant:applied', listener)
  return () => hot.off('canvas-assistant:applied', listener)
}

import { useMemo } from 'react'
import { createCanvasServerAdapter } from '@/shell/assistant/canvasServerAdapter'
import { usePageModelAdapter } from '@/shell/assistant/modelAdapterMode'
import { usePageAssistant } from '@/shell/assistant/usePageAssistant'

export function useCanvasAssistant({
  appId,
  canvasId,
  ready,
}: {
  appId: string
  canvasId: string
  ready: boolean
}) {
  const adapter = useMemo(
    () => createCanvasServerAdapter({ appId, canvasId }),
    [appId, canvasId],
  )
  usePageModelAdapter(ready ? adapter : null)
  usePageAssistant({
    instructions: '',
    available: ready,
  })
}

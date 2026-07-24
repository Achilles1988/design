import { useEffect, useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { checkCanvasAssistantContext } from '@/lib/canvasAssistantApi'
import { loadCanvasModule } from './loadCanvasModule'
import { CanvasAssistantTools } from './CanvasAssistantTools'
import {
  subscribeCanvasApplied,
  type CanvasAssistantHotContext,
} from './canvasHotReload'
import { useCanvasAssistant } from './useCanvasAssistant'
import '../features/apps/apps.css'

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; Canvas: ComponentType }

type AssistantContextState =
  | { status: 'loading'; appId: string; canvasId: string }
  | { status: 'error'; appId: string; canvasId: string; message: string }
  | { status: 'ready'; appId: string; canvasId: string }

const GLOB_MISS_HINT =
  'Canvas not found / restart dev server after adding files if glob cache stale'
const CANVAS_ENTRY_MISSING = 'Canvas entry not found in canvases.json'

type SubscribeApplied = (
  appId: string,
  canvasId: string,
  callback: () => void,
  hot?: CanvasAssistantHotContext,
) => () => void

export function CanvasPreview({
  subscribeApplied = subscribeCanvasApplied,
}: {
  subscribeApplied?: SubscribeApplied
} = {}) {
  const { id: appId = '', canvasId = '' } = useParams<{
    id: string
    canvasId: string
  }>()
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  const [assistantContext, setAssistantContext] =
    useState<AssistantContextState>({
      status: 'loading',
      appId: '',
      canvasId: '',
    })
  const [previewRevision, setPreviewRevision] = useState(0)
  const assistantOwnsCurrentCanvas =
    assistantContext.appId === appId &&
    assistantContext.canvasId === canvasId
  const assistantReady =
    assistantOwnsCurrentCanvas && assistantContext.status === 'ready'
  const assistantError =
    assistantOwnsCurrentCanvas && assistantContext.status === 'error'
      ? assistantContext
      : null
  useCanvasAssistant({ appId, canvasId, ready: assistantReady })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    if (!appId || !canvasId) {
      setState({ status: 'error', message: CANVAS_ENTRY_MISSING })
      return
    }

    ;(async () => {
      try {
        const canvases = await designApi.listCanvases(appId)
        const entry = canvases.find((c) => c.id === canvasId)
        if (!entry) {
          if (!cancelled) {
            setState({ status: 'error', message: CANVAS_ENTRY_MISSING })
          }
          return
        }

        const Canvas = await loadCanvasModule(appId, entry.component)
        if (cancelled) return
        if (!Canvas) {
          setState({ status: 'error', message: GLOB_MISS_HINT })
          return
        }
        setState({ status: 'ready', Canvas })
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : GLOB_MISS_HINT,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [appId, canvasId])

  useEffect(() => {
    let cancelled = false
    setAssistantContext({ status: 'loading', appId, canvasId })
    if (!appId || !canvasId) return

    checkCanvasAssistantContext({ appId, canvasId })
      .then(() => {
        if (!cancelled) {
          setAssistantContext({ status: 'ready', appId, canvasId })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAssistantContext({
            status: 'error',
            appId,
            canvasId,
            message:
              error instanceof Error
                ? error.message
                : 'Canvas context could not be loaded.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId, canvasId])

  useEffect(() => {
    if (!appId || !canvasId) return
    return subscribeApplied(appId, canvasId, () => {
      setPreviewRevision((revision) => revision + 1)
    })
  }, [appId, canvasId, subscribeApplied])

  const assistantTools = assistantReady ? (
    <CanvasAssistantTools appId={appId} canvasId={canvasId} />
  ) : null

  if (state.status === 'loading') {
    return (
      <>
        <p className="apps-muted">Loading preview…</p>
        {assistantTools}
      </>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="apps-page">
        <p className="apps-error">{state.message}</p>
        {appId ? (
          <p>
            <Link className="apps-btn apps-btn--ghost" to={`/apps/${appId}`}>
              Back to app
            </Link>
          </p>
        ) : null}
        {assistantError ? (
          <p className="apps-error">
            Canvas Assistant unavailable: {assistantError.message}
          </p>
        ) : null}
        {assistantTools}
      </div>
    )
  }

  const { Canvas } = state
  return (
    <>
      {assistantError ? (
        <p className="apps-error" role="status">
          Canvas Assistant unavailable: {assistantError.message}
        </p>
      ) : null}
      <Canvas key={previewRevision} />
      {assistantTools}
    </>
  )
}

import { useEffect, useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { loadCanvasModule } from './loadCanvasModule'
import '../features/apps/apps.css'

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; Canvas: ComponentType }

const GLOB_MISS_HINT =
  'Canvas not found / restart dev server after adding files if glob cache stale'
const CANVAS_ENTRY_MISSING = 'Canvas entry not found in canvases.json'

export function CanvasPreview() {
  const { id: appId = '', canvasId = '' } = useParams<{
    id: string
    canvasId: string
  }>()
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

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

  if (state.status === 'loading') {
    return <p className="apps-muted">Loading preview…</p>
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
      </div>
    )
  }

  const { Canvas } = state
  return <Canvas />
}

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { checkCanvasAssistantContext } from '@/lib/canvasAssistantApi'
import { getTheme, subscribeTheme, type ThemeMode } from '@/lib/theme'
import { CanvasAssistantTools } from './CanvasAssistantTools'
import { createCanvasPreviewDocument } from './canvasPreviewDocument'
import {
  subscribeCanvasApplied,
  type CanvasAssistantHotContext,
} from './canvasHotReload'
import { useCanvasAssistant } from './useCanvasAssistant'
import '../features/apps/apps.css'

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; componentFile: string }

type AssistantContextState =
  | { status: 'loading'; appId: string; canvasId: string }
  | { status: 'error'; appId: string; canvasId: string; message: string }
  | { status: 'ready'; appId: string; canvasId: string }

const GLOB_MISS_HINT =
  'Canvas not found / restart dev server after adding files if glob cache stale'
const CANVAS_ENTRY_MISSING = 'Canvas entry not found in canvases.json'
const MAX_PREVIEW_ERROR_LENGTH = 4_000

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
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme())
  const frameRef = useRef<HTMLIFrameElement>(null)
  const previewGeneration = `${appId}:${canvasId}:${previewRevision}`
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

        if (cancelled) return
        setState({ status: 'ready', componentFile: entry.component })
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
  }, [appId, canvasId, previewRevision])

  useEffect(() => subscribeTheme(setThemeState), [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        event.origin !== 'null' ||
        !event.data ||
        typeof event.data !== 'object'
      ) {
        return
      }
      const message = event.data as Record<string, unknown>
      if (
        message.type === 'canvas-preview:ready' &&
        message.generation === previewGeneration &&
        Object.keys(message).length === 2
      ) {
        frameRef.current.dataset.previewState = 'ready'
        return
      }
      if (
        message.type !== 'canvas-preview:error' ||
        message.generation !== previewGeneration ||
        Object.keys(message).length !== 3 ||
        typeof message.message !== 'string' ||
        message.message.length === 0 ||
        message.message.length > MAX_PREVIEW_ERROR_LENGTH
      ) {
        return
      }
      setState({ status: 'error', message: message.message })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [previewGeneration])

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
  const assistantErrorAlert = assistantError ? (
    <p className="canvas-assistant-context-error" role="alert">
      Canvas Assistant unavailable: {assistantError.message}
    </p>
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
        {assistantErrorAlert}
        {assistantTools}
      </div>
    )
  }

  const sourceDocument = createCanvasPreviewDocument({
    appId,
    componentFile: state.componentFile,
    generation: previewGeneration,
    theme,
  })
  return (
    <>
      {assistantErrorAlert}
      <iframe
        ref={frameRef}
        key={previewGeneration}
        className="canvas-preview-frame"
        title="Canvas preview"
        sandbox="allow-scripts"
        srcDoc={sourceDocument}
        data-preview-generation={previewGeneration}
        data-preview-state="loading"
      />
      {assistantTools}
    </>
  )
}

import { useEffect, useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { loadPageModule } from './loadPageModule'
import '../features/apps/apps.css'

type PreviewState =
  | { status: 'loading' }
  | { status: 'missing'; message: string }
  | { status: 'ready'; Page: ComponentType }

const MISSING_HINT =
  'Page not found / restart dev server after adding files if glob cache stale'

export function PagePreview() {
  const { id: appId = '', pageId = '' } = useParams<{
    id: string
    pageId: string
  }>()
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    if (!appId || !pageId) {
      setState({ status: 'missing', message: MISSING_HINT })
      return
    }

    ;(async () => {
      try {
        const pages = await designApi.listPages(appId)
        const entry = pages.find((p) => p.id === pageId)
        if (!entry) {
          if (!cancelled) {
            setState({ status: 'missing', message: MISSING_HINT })
          }
          return
        }

        const Page = await loadPageModule(appId, entry.component)
        if (cancelled) return
        if (!Page) {
          setState({ status: 'missing', message: MISSING_HINT })
          return
        }
        setState({ status: 'ready', Page })
      } catch (err: unknown) {
        if (!cancelled) {
          setState({
            status: 'missing',
            message: err instanceof Error ? err.message : MISSING_HINT,
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [appId, pageId])

  if (state.status === 'loading') {
    return <p className="apps-muted">Loading preview…</p>
  }

  if (state.status === 'missing') {
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

  const { Page } = state
  return <Page />
}

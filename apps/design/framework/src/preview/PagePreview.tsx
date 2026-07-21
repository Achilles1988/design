import { useEffect, useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { loadPageModule } from './loadPageModule'
import '../features/apps/apps.css'

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; Page: ComponentType }

const GLOB_MISS_HINT =
  'Page not found / restart dev server after adding files if glob cache stale'
const PAGE_ENTRY_MISSING = 'Page entry not found in pages.json'

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
      setState({ status: 'error', message: PAGE_ENTRY_MISSING })
      return
    }

    ;(async () => {
      try {
        const pages = await designApi.listPages(appId)
        const entry = pages.find((p) => p.id === pageId)
        if (!entry) {
          if (!cancelled) {
            setState({ status: 'error', message: PAGE_ENTRY_MISSING })
          }
          return
        }

        const Page = await loadPageModule(appId, entry.component)
        if (cancelled) return
        if (!Page) {
          setState({ status: 'error', message: GLOB_MISS_HINT })
          return
        }
        setState({ status: 'ready', Page })
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
  }, [appId, pageId])

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

  const { Page } = state
  return <Page />
}

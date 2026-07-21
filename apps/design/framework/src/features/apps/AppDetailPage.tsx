import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { isValidAppId, slugify } from '@/lib/slug'
import type { AppConfig, PageEntry } from '@/lib/types'
import './apps.css'

async function loadAppData(appId: string): Promise<{
  app: AppConfig
  pages: PageEntry[]
}> {
  const [app, pages] = await Promise.all([
    designApi.getApp(appId),
    designApi.listPages(appId),
  ])
  return { app, pages }
}

export function AppDetailPage() {
  const { id: appId = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [app, setApp] = useState<AppConfig | null>(null)
  const [pages, setPages] = useState<PageEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [pageName, setPageName] = useState('')
  const [pageId, setPageId] = useState('')
  const [pageIdDirty, setPageIdDirty] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)
  const loadRun = useRef(0)

  const pageIdValid = isValidAppId(pageId)
  const canSubmit =
    pageName.trim().length > 0 && pageIdValid && !submitting && !busy

  async function reload(runId: number) {
    setLoadError(null)
    const { app: nextApp, pages: nextPages } = await loadAppData(appId)
    if (runId !== loadRun.current) return
    setApp(nextApp)
    setPages(nextPages)
  }

  useEffect(() => {
    let cancelled = false
    setApp(null)
    setPages(null)
    setLoadError(null)

    if (!appId) {
      setLoadError('Missing app id')
      return
    }

    const runId = ++loadRun.current

    loadAppData(appId)
      .then(({ app: nextApp, pages: nextPages }) => {
        if (runId !== loadRun.current) return
        if (!cancelled) {
          setApp(nextApp)
          setPages(nextPages)
        }
      })
      .catch((err: unknown) => {
        if (runId !== loadRun.current) return
        if (!cancelled) {
          setApp(null)
          setPages([])
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load app',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId])

  function onPageNameChange(value: string) {
    setPageName(value)
    if (!pageIdDirty) setPageId(slugify(value))
  }

  function onPageIdChange(value: string) {
    setPageIdDirty(true)
    setPageId(value)
  }

  async function onAddPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setFormError(null)
    try {
      await designApi.addPage(appId, {
        id: pageId,
        name: pageName.trim(),
      })
      setPageName('')
      setPageId('')
      setPageIdDirty(false)
      await reload(loadRun.current)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add page')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDeletePage(page: PageEntry) {
    if (!confirm(`Delete page “${page.name}” (${page.id})?`)) return
    setBusy(true)
    setFormError(null)
    try {
      await designApi.deletePage(appId, page.id)
      await reload(loadRun.current)
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete page',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteApp() {
    if (!app) return
    if (!confirm(`Delete app “${app.name}” (${app.id})? This cannot be undone.`))
      return
    setBusy(true)
    setFormError(null)
    try {
      await designApi.deleteApp(appId)
      navigate('/')
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete app',
      )
      setBusy(false)
    }
  }

  return (
    <div className="apps-page">
      <div className="apps-page__header">
        <div>
          <h1>{app?.name ?? 'App'}</h1>
          <p className="apps-page__lead">
            App metadata and blank pages on disk.
          </p>
        </div>
        <div className="apps-page__actions">
          <Link className="apps-btn apps-btn--ghost" to="/">
            All apps
          </Link>
          <button
            className="apps-btn apps-btn--danger"
            type="button"
            onClick={onDeleteApp}
            disabled={!app || busy}
          >
            Delete app
          </button>
        </div>
      </div>

      {loadError ? <p className="apps-error">{loadError}</p> : null}
      {formError ? <p className="apps-error">{formError}</p> : null}

      {app === null && !loadError ? (
        <p className="apps-muted">Loading app…</p>
      ) : null}

      {app ? (
        <dl className="apps-meta">
          <div>
            <dt>Name</dt>
            <dd>{app.name}</dd>
          </div>
          <div>
            <dt>ID</dt>
            <dd>
              <code>{app.id}</code>
            </dd>
          </div>
          <div>
            <dt>Path</dt>
            <dd className={app.path ? undefined : 'apps-muted'}>
              {app.path ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Style</dt>
            <dd>
              <code>{app.style}</code>
            </dd>
          </div>
          <div>
            <dt>Layout</dt>
            <dd>
              <code>{app.layout}</code>
            </dd>
          </div>
        </dl>
      ) : null}

      {app ? (
        <section className="apps-section">
          <h2 className="apps-section__title">Pages</h2>

          {pages === null ? (
            <p className="apps-muted">Loading pages…</p>
          ) : null}

          {pages !== null && pages.length === 0 ? (
            <p className="apps-empty">No pages yet. Add a blank page below.</p>
          ) : null}

          {pages !== null && pages.length > 0 ? (
            <div className="apps-table-wrap">
              <table className="apps-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">ID</th>
                    <th scope="col">Component</th>
                    <th scope="col">
                      <span className="apps-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id}>
                      <td>
                        <Link to={`/apps/${appId}/pages/${page.id}`}>
                          {page.name}
                        </Link>
                      </td>
                      <td>
                        <code>{page.id}</code>
                      </td>
                      <td>
                        <code>{page.component}</code>
                      </td>
                      <td>
                        <button
                          className="apps-btn apps-btn--ghost apps-btn--small"
                          type="button"
                          onClick={() => onDeletePage(page)}
                          disabled={busy || submitting}
                          aria-label={`Delete page ${page.name}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form className="apps-form" onSubmit={onAddPage} noValidate>
            <h3 className="apps-section__subtitle">Add blank page</h3>

            <div className="apps-field">
              <label htmlFor="page-name">Name</label>
              <input
                id="page-name"
                name="name"
                type="text"
                value={pageName}
                onChange={(e) => onPageNameChange(e.target.value)}
                required
                autoComplete="off"
                placeholder="Home"
                disabled={busy}
              />
            </div>

            <div className="apps-field">
              <label htmlFor="page-id">ID</label>
              <input
                id="page-id"
                name="id"
                type="text"
                value={pageId}
                onChange={(e) => onPageIdChange(e.target.value)}
                aria-invalid={
                  pageId.length > 0 && !pageIdValid ? true : undefined
                }
                autoComplete="off"
                placeholder="home"
                disabled={busy}
              />
              <p className="apps-field__hint">
                Lowercase letter, then letters, digits, or hyphens.
                {!pageIdDirty ? ' Prefills from name until you edit it.' : null}
              </p>
              {pageId.length > 0 && !pageIdValid ? (
                <p className="apps-field__error">
                  ID must start with a lowercase letter and only contain
                  lowercase letters, digits, or hyphens.
                </p>
              ) : null}
            </div>

            <div className="apps-form__footer">
              <button className="apps-btn" type="submit" disabled={!canSubmit}>
                {submitting ? 'Adding…' : 'Add page'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  )
}

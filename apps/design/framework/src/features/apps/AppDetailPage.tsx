import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { emitCanvasesChanged } from '@/lib/canvasEvents'
import { isValidAppId, slugify } from '@/lib/slug'
import type { AppConfig, CanvasEntry } from '@/lib/types'
import './apps.css'

async function loadAppData(appId: string): Promise<{
  app: AppConfig
  canvases: CanvasEntry[]
}> {
  const [app, canvases] = await Promise.all([
    designApi.getApp(appId),
    designApi.listCanvases(appId),
  ])
  return { app, canvases }
}

export function AppDetailPage() {
  const { id: appId = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [app, setApp] = useState<AppConfig | null>(null)
  const [canvases, setCanvases] = useState<CanvasEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [canvasName, setCanvasName] = useState('')
  const [canvasId, setCanvasId] = useState('')
  const [canvasIdDirty, setCanvasIdDirty] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)
  const loadRun = useRef(0)

  const canvasIdValid = isValidAppId(canvasId)
  const canSubmit =
    canvasName.trim().length > 0 && canvasIdValid && !submitting && !busy

  async function reload(runId: number) {
    setLoadError(null)
    const { app: nextApp, canvases: nextCanvases } = await loadAppData(appId)
    if (runId !== loadRun.current) return
    setApp(nextApp)
    setCanvases(nextCanvases)
  }

  useEffect(() => {
    let cancelled = false
    setApp(null)
    setCanvases(null)
    setLoadError(null)

    if (!appId) {
      setLoadError('Missing app id')
      return
    }

    const runId = ++loadRun.current

    loadAppData(appId)
      .then(({ app: nextApp, canvases: nextCanvases }) => {
        if (runId !== loadRun.current) return
        if (!cancelled) {
          setApp(nextApp)
          setCanvases(nextCanvases)
        }
      })
      .catch((err: unknown) => {
        if (runId !== loadRun.current) return
        if (!cancelled) {
          setApp(null)
          setCanvases([])
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load app',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId])

  function onCanvasNameChange(value: string) {
    setCanvasName(value)
    if (!canvasIdDirty) setCanvasId(slugify(value))
  }

  function onCanvasIdChange(value: string) {
    setCanvasIdDirty(true)
    setCanvasId(value)
  }

  async function onAddCanvas(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setFormError(null)
    try {
      await designApi.addCanvas(appId, {
        id: canvasId,
        name: canvasName.trim(),
      })
      setCanvasName('')
      setCanvasId('')
      setCanvasIdDirty(false)
      await reload(loadRun.current)
      emitCanvasesChanged()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add canvas')
    } finally {
      setSubmitting(false)
    }
  }

  async function onDeleteCanvas(canvas: CanvasEntry) {
    if (!confirm(`Delete canvas “${canvas.name}” (${canvas.id})?`)) return
    setBusy(true)
    setFormError(null)
    try {
      await designApi.deleteCanvas(appId, canvas.id)
      await reload(loadRun.current)
      emitCanvasesChanged()
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete canvas',
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
      emitCanvasesChanged()
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
            App metadata and canvases on disk.
          </p>
        </div>
        <div className="apps-page__actions">
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
          <h2 className="apps-section__title">Canvases</h2>

          {canvases === null ? (
            <p className="apps-muted">Loading canvases…</p>
          ) : null}

          {canvases !== null && canvases.length > 0 ? (
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
                  {canvases.map((canvas) => (
                    <tr key={canvas.id}>
                      <td>
                        <Link to={`/apps/${appId}/canvases/${canvas.id}`}>
                          {canvas.name}
                        </Link>
                      </td>
                      <td>
                        <code>{canvas.id}</code>
                      </td>
                      <td>
                        <code>{canvas.component}</code>
                      </td>
                      <td>
                        <button
                          className="apps-btn apps-btn--ghost apps-btn--small"
                          type="button"
                          onClick={() => onDeleteCanvas(canvas)}
                          disabled={busy || submitting}
                          aria-label={`Delete canvas ${canvas.name}`}
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

          <form className="apps-form" onSubmit={onAddCanvas} noValidate>
            <h3 className="apps-section__subtitle">Add canvas</h3>

            <div className="apps-field">
              <label htmlFor="canvas-name">Name</label>
              <input
                id="canvas-name"
                name="name"
                type="text"
                value={canvasName}
                onChange={(e) => onCanvasNameChange(e.target.value)}
                required
                autoComplete="off"
                placeholder="Home"
                disabled={busy}
              />
            </div>

            <div className="apps-field">
              <label htmlFor="canvas-id">ID</label>
              <input
                id="canvas-id"
                name="id"
                type="text"
                value={canvasId}
                onChange={(e) => onCanvasIdChange(e.target.value)}
                aria-invalid={
                  canvasId.length > 0 && !canvasIdValid ? true : undefined
                }
                autoComplete="off"
                placeholder="home"
                disabled={busy}
              />
              <p className="apps-field__hint">
                Lowercase letter, then letters, digits, or hyphens.
                {!canvasIdDirty
                  ? ' Prefills from name until you edit it.'
                  : null}
              </p>
              {canvasId.length > 0 && !canvasIdValid ? (
                <p className="apps-field__error">
                  ID must start with a lowercase letter and only contain
                  lowercase letters, digits, or hyphens.
                </p>
              ) : null}
            </div>

            <div className="apps-form__footer">
              <button className="apps-btn" type="submit" disabled={!canSubmit}>
                {submitting ? 'Adding…' : 'Add canvas'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  )
}

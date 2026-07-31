import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { LAYOUT_INSTALL_TIP } from '@/lib/assetNotices'
import { emitCanvasesChanged } from '@/lib/canvasEvents'
import { writeCanvasRenameNotice } from '@/lib/canvasRenameNotice'
import { confirmTip } from '@/lib/confirmTip'
import { isValidAppId, slugify } from '@/lib/slug'
import type { AppConfig, AssetEntry, CanvasEntry, StyleSlot } from '@/lib/types'
import { DisclosureForm } from '@/ui/DisclosureForm'
import { SectionHeader } from '@/ui/SectionHeader'
import './apps.css'

const BROWSE_LAYOUTS = '__browse__'

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
  const [layoutOptions, setLayoutOptions] = useState<AssetEntry[] | null>(null)
  const [layoutOptionsError, setLayoutOptionsError] = useState<string | null>(
    null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  const [addCanvasOpen, setAddCanvasOpen] = useState(false)
  const [canvasName, setCanvasName] = useState('')
  const [canvasId, setCanvasId] = useState('')
  const [canvasIdDirty, setCanvasIdDirty] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editId, setEditId] = useState('')
  const [editIdDirty, setEditIdDirty] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [busy, setBusy] = useState(false)
  const loadRun = useRef(0)
  const activeAppId = useRef(appId)
  const addCanvasButtonRef = useRef<HTMLButtonElement>(null)
  const canvasNameInputRef = useRef<HTMLInputElement>(null)
  const editNameInputRef = useRef<HTMLInputElement>(null)
  const restoreAddCanvasFocus = useRef(false)
  activeAppId.current = appId

  const canvasIdValid = isValidAppId(canvasId)
  const canSubmit =
    canvasName.trim().length > 0 && canvasIdValid && !submitting && !busy
  const editIdValid = isValidAppId(editId)
  const canSaveEdit =
    editName.trim().length > 0 &&
    editIdValid &&
    !editSubmitting &&
    !busy &&
    !submitting

  function isCurrentOperation(targetAppId: string, runId: number) {
    return targetAppId === activeAppId.current && runId === loadRun.current
  }

  async function reload(targetAppId: string, runId: number) {
    if (isCurrentOperation(targetAppId, runId)) setLoadError(null)
    const { app: nextApp, canvases: nextCanvases } = await loadAppData(targetAppId)
    if (!isCurrentOperation(targetAppId, runId)) return
    setApp(nextApp)
    setCanvases(nextCanvases)
  }

  useEffect(() => {
    let cancelled = false
    setApp(null)
    setCanvases(null)
    setLoadError(null)
    setAddCanvasOpen(false)
    setCanvasName('')
    setCanvasId('')
    setCanvasIdDirty(false)
    setEditingId(null)
    setEditName('')
    setEditId('')
    setEditIdDirty(false)
    setFormError(null)
    setSubmitting(false)
    setEditSubmitting(false)
    setBusy(false)
    restoreAddCanvasFocus.current = false

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

  useEffect(() => {
    let cancelled = false
    setLayoutOptions(null)
    setLayoutOptionsError(null)
    designApi
      .listAssets('layoutmd')
      .then((data) => {
        if (!cancelled) {
          setLayoutOptions(data)
          setLayoutOptionsError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLayoutOptions([])
          setLayoutOptionsError(
            err instanceof Error
              ? err.message
              : 'Failed to load layout packages',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (addCanvasOpen) {
      canvasNameInputRef.current?.focus()
      return
    }
    if (restoreAddCanvasFocus.current) {
      restoreAddCanvasFocus.current = false
      addCanvasButtonRef.current?.focus()
    }
  }, [addCanvasOpen])

  useEffect(() => {
    if (editingId) editNameInputRef.current?.focus()
  }, [editingId])

  function onCanvasNameChange(value: string) {
    setCanvasName(value)
    if (!canvasIdDirty) setCanvasId(slugify(value))
  }

  function onCanvasIdChange(value: string) {
    setCanvasIdDirty(true)
    setCanvasId(value)
  }

  function onEditNameChange(value: string) {
    setEditName(value)
    if (!editIdDirty) setEditId(slugify(value))
  }

  function onEditIdChange(value: string) {
    setEditIdDirty(true)
    setEditId(value)
  }

  function startEditCanvas(canvas: CanvasEntry) {
    setFormError(null)
    setAddCanvasOpen(false)
    setCanvasName('')
    setCanvasId('')
    setCanvasIdDirty(false)
    setEditingId(canvas.id)
    setEditName(canvas.name)
    setEditId(canvas.id)
    setEditIdDirty(false)
  }

  function onCancelEditCanvas() {
    setFormError(null)
    setEditingId(null)
    setEditName('')
    setEditId('')
    setEditIdDirty(false)
    setEditSubmitting(false)
  }

  async function onSaveEditCanvas(canvas: CanvasEntry) {
    if (!canSaveEdit) return

    const targetAppId = appId
    const runId = loadRun.current
    const nextId = editId
    const nextName = editName.trim()
    setEditSubmitting(true)
    setFormError(null)
    try {
      const result = await designApi.renameCanvas(targetAppId, canvas.id, {
        id: nextId,
        name: nextName,
      })
      if (canvas.id !== result.id || canvas.name !== result.name) {
        writeCanvasRenameNotice({
          appId: targetAppId,
          fromId: canvas.id,
          toId: result.id,
          name: result.name,
        })
      }
      emitCanvasesChanged()
      if (!isCurrentOperation(targetAppId, runId)) return
      setEditingId(null)
      setEditName('')
      setEditId('')
      setEditIdDirty(false)
      await reload(targetAppId, runId)
    } catch (err: unknown) {
      if (!isCurrentOperation(targetAppId, runId)) return
      setFormError(
        err instanceof Error ? err.message : 'Failed to rename canvas',
      )
    } finally {
      if (isCurrentOperation(targetAppId, runId)) setEditSubmitting(false)
    }
  }

  function onCancelAddCanvas() {
    setFormError(null)
    setCanvasName('')
    setCanvasId('')
    setCanvasIdDirty(false)
    restoreAddCanvasFocus.current = true
    setAddCanvasOpen(false)
  }

  async function onAddCanvas(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    const targetAppId = appId
    const runId = loadRun.current
    setSubmitting(true)
    setFormError(null)
    try {
      await designApi.addCanvas(targetAppId, {
        id: canvasId,
        name: canvasName.trim(),
      })
      emitCanvasesChanged()
      if (!isCurrentOperation(targetAppId, runId)) return
      setCanvasName('')
      setCanvasId('')
      setCanvasIdDirty(false)
      await reload(targetAppId, runId)
      if (isCurrentOperation(targetAppId, runId)) {
        restoreAddCanvasFocus.current = true
        setAddCanvasOpen(false)
      }
    } catch (err: unknown) {
      if (!isCurrentOperation(targetAppId, runId)) return
      setFormError(err instanceof Error ? err.message : 'Failed to add canvas')
    } finally {
      if (isCurrentOperation(targetAppId, runId)) setSubmitting(false)
    }
  }

  async function onDeleteCanvas(canvas: CanvasEntry) {
    const ok = await confirmTip({
      message: `Delete canvas “${canvas.name}”?`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const targetAppId = appId
    const runId = loadRun.current
    setBusy(true)
    setFormError(null)
    try {
      await designApi.deleteCanvas(targetAppId, canvas.id)
      emitCanvasesChanged()
      await reload(targetAppId, runId)
    } catch (err: unknown) {
      if (!isCurrentOperation(targetAppId, runId)) return
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete canvas',
      )
    } finally {
      if (isCurrentOperation(targetAppId, runId)) setBusy(false)
    }
  }

  async function onRemoveStyle(slot: StyleSlot) {
    if (!app || busy) return
    const targetAppId = appId
    const runId = loadRun.current
    setBusy(true)
    setFormError(null)
    try {
      const next = await designApi.removeAppStyle(targetAppId, slot)
      if (isCurrentOperation(targetAppId, runId)) setApp(next)
    } catch (err: unknown) {
      if (!isCurrentOperation(targetAppId, runId)) return
      setFormError(
        err instanceof Error ? err.message : 'Failed to clear style',
      )
    } finally {
      if (isCurrentOperation(targetAppId, runId)) setBusy(false)
    }
  }

  async function onRemoveLayout(layoutId: string) {
    if (!app || busy) return
    const ok = await confirmTip({
      message: `Remove layout “${layoutId}” from this App?`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    const targetAppId = appId
    const runId = loadRun.current
    setBusy(true)
    setFormError(null)
    try {
      const next = await designApi.removeAppLayout(targetAppId, layoutId)
      if (isCurrentOperation(targetAppId, runId)) setApp(next)
    } catch (err: unknown) {
      if (!isCurrentOperation(targetAppId, runId)) return
      setFormError(
        err instanceof Error ? err.message : 'Failed to remove layout',
      )
    } finally {
      if (isCurrentOperation(targetAppId, runId)) setBusy(false)
    }
  }

  async function onLayoutSelect(value: string) {
    if (!value || !app || busy) return
    if (value === BROWSE_LAYOUTS) {
      navigate(`/assets/layout?appId=${encodeURIComponent(app.id)}`)
      return
    }
    const ok = await confirmTip({
      message: LAYOUT_INSTALL_TIP,
      confirmLabel: 'Install',
    })
    if (!ok) return
    const targetAppId = appId
    const runId = loadRun.current
    setBusy(true)
    setFormError(null)
    try {
      const next = await designApi.applyAsset('layoutmd', value, targetAppId)
      if (isCurrentOperation(targetAppId, runId)) setApp(next)
    } catch (err: unknown) {
      if (!isCurrentOperation(targetAppId, runId)) return
      setFormError(
        err instanceof Error ? err.message : 'Failed to install layout',
      )
    } finally {
      if (isCurrentOperation(targetAppId, runId)) setBusy(false)
    }
  }

  const addableLayouts =
    layoutOptions?.filter((entry) => !app?.layouts.includes(entry.id)) ?? []

  return (
    <div className="apps-page">
      <div className="apps-page__header">
        <div>
          <h1>{app?.name ?? 'App'}</h1>
          <p className="apps-page__lead">
            App metadata and canvases on disk.
          </p>
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
            <dt>APP</dt>
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
          {(['light', 'dark'] as const).map((slot) => {
            const value = app.style[slot]
            const label = slot === 'light' ? 'Light' : 'Dark'
            const lowerLabel = label.toLowerCase()
            return (
              <div key={slot}>
                <dt>{label}</dt>
                <dd>
                  <div className="apps-style-field">
                    <Link
                      className="apps-meta__editable"
                      to={`/assets/rule?appId=${encodeURIComponent(app.id)}&slot=${slot}`}
                      title={`Open style library to ${value ? 'replace' : 'set'} the ${lowerLabel} style`}
                      aria-label={
                        value
                          ? `Edit ${lowerLabel} style ${value}`
                          : `Set ${lowerLabel} style`
                      }
                    >
                      {value ? (
                        <code>{value}</code>
                      ) : (
                        <span className="apps-muted">—</span>
                      )}
                      <span className="apps-meta__edit-hint" aria-hidden="true">
                        Edit
                      </span>
                    </Link>
                    {value ? (
                      <button
                        type="button"
                        className="apps-layout-chip__remove"
                        onClick={() => onRemoveStyle(slot)}
                        disabled={busy}
                        aria-label={`Clear ${lowerLabel} style`}
                        title={`Clear ${lowerLabel} style`}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </dd>
              </div>
            )
          })}
          <div className="apps-meta__layouts">
            <dt>Layouts</dt>
            <dd>
              <div className="apps-layout-field">
                <ul className="apps-layout-chips">
                  {app.layouts.map((layoutId) => (
                    <li key={layoutId} className="apps-layout-chip">
                      <code>{layoutId}</code>
                      <button
                        type="button"
                        className="apps-layout-chip__remove"
                        onClick={() => onRemoveLayout(layoutId)}
                        disabled={busy || app.layouts.length <= 1}
                        aria-label={`Remove layout ${layoutId}`}
                        title={
                          app.layouts.length <= 1
                            ? 'At least one layout is required'
                            : `Remove ${layoutId}`
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <select
                  className="apps-layout-select"
                  aria-label="Add or browse layouts"
                  value=""
                  disabled={busy || layoutOptions === null}
                  onChange={(e) => {
                    void onLayoutSelect(e.target.value)
                  }}
                >
                  <option value="">
                    {layoutOptions === null
                      ? 'Loading layouts…'
                      : 'Add layout…'}
                  </option>
                  {addableLayouts.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.id}
                    </option>
                  ))}
                  <option value={BROWSE_LAYOUTS}>Browse layouts…</option>
                </select>
              </div>
              {layoutOptionsError ? (
                <p className="apps-field__error">{layoutOptionsError}</p>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : null}

      {app ? (
        <section className="apps-section">
          <SectionHeader
            title={
              <h2 id="canvases-heading" className="apps-section__title">
                Canvases
              </h2>
            }
            action={
              !addCanvasOpen ? (
                <button
                  ref={addCanvasButtonRef}
                  type="button"
                  className="apps-btn"
                  aria-expanded="false"
                  aria-controls="add-canvas-form"
                  onClick={() => setAddCanvasOpen(true)}
                >
                  Add canvas
                </button>
              ) : null
            }
          />

          {canvases === null ? (
            <p className="apps-muted">Loading canvases…</p>
          ) : null}

          {canvases !== null && canvases.length > 0 ? (
            <div className="apps-table-wrap">
              <table className="apps-table">
                <thead>
                  <tr>
                    <th scope="col">CANVAS</th>
                    <th scope="col">ID</th>
                    <th scope="col">
                      <span className="apps-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {canvases.map((canvas) => {
                    const isEditing = editingId === canvas.id
                    return (
                      <tr
                        key={canvas.id}
                        className={
                          isEditing ? 'apps-table__row--editing' : undefined
                        }
                      >
                        {isEditing ? (
                          <>
                            <td>
                              <div className="apps-table__edit-field">
                                <label
                                  className="apps-sr-only"
                                  htmlFor={`edit-canvas-name-${canvas.id}`}
                                >
                                  Name
                                </label>
                                <input
                                  ref={editNameInputRef}
                                  id={`edit-canvas-name-${canvas.id}`}
                                  name="edit-name"
                                  type="text"
                                  value={editName}
                                  onChange={(e) =>
                                    onEditNameChange(e.target.value)
                                  }
                                  required
                                  autoComplete="off"
                                  disabled={busy || editSubmitting}
                                />
                              </div>
                            </td>
                            <td>
                              <div className="apps-table__edit-field">
                                <label
                                  className="apps-sr-only"
                                  htmlFor={`edit-canvas-id-${canvas.id}`}
                                >
                                  ID
                                </label>
                                <input
                                  id={`edit-canvas-id-${canvas.id}`}
                                  name="edit-id"
                                  type="text"
                                  value={editId}
                                  onChange={(e) =>
                                    onEditIdChange(e.target.value)
                                  }
                                  aria-invalid={
                                    editId.length > 0 && !editIdValid
                                      ? true
                                      : undefined
                                  }
                                  aria-describedby={
                                    editId.length > 0 && !editIdValid
                                      ? `edit-canvas-id-error-${canvas.id}`
                                      : undefined
                                  }
                                  required
                                  autoComplete="off"
                                  disabled={busy || editSubmitting}
                                />
                                {editId.length > 0 && !editIdValid ? (
                                  <p
                                    id={`edit-canvas-id-error-${canvas.id}`}
                                    className="apps-field__error"
                                  >
                                    ID must start with a lowercase letter and
                                    only contain lowercase letters, digits, or
                                    hyphens.
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="apps-table__actions">
                              <button
                                className="apps-btn apps-btn--ghost apps-btn--small"
                                type="button"
                                onClick={onCancelEditCanvas}
                                disabled={editSubmitting}
                              >
                                Cancel
                              </button>
                              <button
                                className="apps-btn apps-btn--small"
                                type="button"
                                onClick={() => onSaveEditCanvas(canvas)}
                                disabled={!canSaveEdit}
                              >
                                {editSubmitting ? 'Renaming…' : 'Save'}
                              </button>
                              <button
                                className="apps-btn apps-btn--ghost apps-btn--small"
                                type="button"
                                onClick={() => onDeleteCanvas(canvas)}
                                disabled
                                aria-label={`Delete canvas ${canvas.name}`}
                              >
                                Delete
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              <Link
                                to={`/apps/${appId}/canvases/${canvas.id}`}
                              >
                                {canvas.name}
                              </Link>
                            </td>
                            <td>
                              <code>{canvas.id}</code>
                            </td>
                            <td className="apps-table__actions">
                              <button
                                className="apps-btn apps-btn--ghost apps-btn--small apps-btn--edit"
                                type="button"
                                onClick={() => startEditCanvas(canvas)}
                                disabled={
                                  busy ||
                                  submitting ||
                                  editSubmitting ||
                                  editingId !== null
                                }
                                aria-label={`Edit canvas ${canvas.name}`}
                              >
                                Edit
                              </button>
                              <button
                                className="apps-btn apps-btn--ghost apps-btn--small"
                                type="button"
                                onClick={() => onDeleteCanvas(canvas)}
                                disabled={
                                  busy ||
                                  submitting ||
                                  editSubmitting ||
                                  editingId !== null
                                }
                                aria-label={`Delete canvas ${canvas.name}`}
                              >
                                Delete
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <DisclosureForm
            open={addCanvasOpen}
            id="add-canvas-form"
            labelledBy="add-canvas-heading"
          >
            <form className="apps-form" onSubmit={onAddCanvas} noValidate>
              <h3 id="add-canvas-heading" className="apps-section__subtitle">
                Add canvas
              </h3>

              <div className="apps-field">
              <label htmlFor="canvas-name">Name</label>
              <input
                ref={canvasNameInputRef}
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
                aria-describedby={`canvas-id-hint${canvasId.length > 0 && !canvasIdValid ? ' canvas-id-error' : ''}`}
                required
                autoComplete="off"
                placeholder="home"
                disabled={busy}
              />
              <p id="canvas-id-hint" className="apps-field__hint">
                Lowercase letter, then letters, digits, or hyphens.
                {!canvasIdDirty
                  ? ' Prefills from name until you edit it.'
                  : null}
              </p>
              {canvasId.length > 0 && !canvasIdValid ? (
                <p id="canvas-id-error" className="apps-field__error">
                  ID must start with a lowercase letter and only contain
                  lowercase letters, digits, or hyphens.
                </p>
              ) : null}
            </div>

              <div className="apps-form__footer">
                <button
                  type="button"
                  className="apps-btn apps-btn--ghost"
                  onClick={onCancelAddCanvas}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button className="apps-btn" type="submit" disabled={!canSubmit}>
                  {submitting ? 'Adding…' : 'Add canvas'}
                </button>
              </div>
            </form>
          </DisclosureForm>
        </section>
      ) : null}
    </div>
  )
}

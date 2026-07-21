import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { isValidAppId, slugify } from '@/lib/slug'
import './apps.css'

export function AppCreatePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idDirty, setIdDirty] = useState(false)
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const idValid = isValidAppId(id)
  const canSubmit = name.trim().length > 0 && idValid && !submitting

  function onNameChange(value: string) {
    setName(value)
    if (!idDirty) setId(slugify(value))
  }

  function onIdChange(value: string) {
    setIdDirty(true)
    setId(value)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    try {
      const trimmedPath = path.trim()
      const created = await designApi.createApp({
        id,
        name: name.trim(),
        ...(trimmedPath ? { path: trimmedPath } : {}),
      })
      setSubmitting(false)
      navigate(`/apps/${created.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create app')
      setSubmitting(false)
    }
  }

  return (
    <div className="apps-page">
      <div className="apps-page__header">
        <div>
          <h1>New app</h1>
          <p className="apps-page__lead">
            Create a design app package on disk.
          </p>
        </div>
      </div>

      {error ? <p className="apps-error">{error}</p> : null}

      <form className="apps-form" onSubmit={onSubmit} noValidate>
        <div className="apps-field">
          <label htmlFor="app-name">Name</label>
          <input
            id="app-name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            autoComplete="off"
            placeholder="Orders"
          />
        </div>

        <div className="apps-field">
          <label htmlFor="app-id">ID</label>
          <input
            id="app-id"
            name="id"
            type="text"
            value={id}
            onChange={(e) => onIdChange(e.target.value)}
            aria-invalid={id.length > 0 && !idValid ? true : undefined}
            autoComplete="off"
            placeholder="orders"
          />
          <p className="apps-field__hint">
            Lowercase letter, then letters, digits, or hyphens.
            {!idDirty ? ' Prefills from name until you edit it.' : null}
          </p>
          {id.length > 0 && !idValid ? (
            <p className="apps-field__error">
              ID must start with a lowercase letter and only contain lowercase
              letters, digits, or hyphens.
            </p>
          ) : null}
        </div>

        <div className="apps-field">
          <label htmlFor="app-path">Path (optional)</label>
          <input
            id="app-path"
            name="path"
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            autoComplete="off"
            placeholder="packages/orders"
          />
        </div>

        <div className="apps-form__footer">
          <button className="apps-btn" type="submit" disabled={!canSubmit}>
            {submitting ? 'Creating…' : 'Create app'}
          </button>
          <Link className="apps-btn apps-btn--ghost" to="/">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

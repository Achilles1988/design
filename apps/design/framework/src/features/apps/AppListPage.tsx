import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { designApi } from '@/lib/api'
import type { AppConfig } from '@/lib/types'
import './apps.css'

export function AppListPage() {
  const [apps, setApps] = useState<AppConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    designApi
      .listApps()
      .then((data) => {
        if (!cancelled) setApps(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setApps([])
          setError(err instanceof Error ? err.message : 'Failed to load apps')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="apps-page">
      <div className="apps-page__header">
        <div>
          <h1>Apps</h1>
          <p className="apps-page__lead">
            Design packages managed under this workspace.
          </p>
        </div>
        <div className="apps-page__actions">
          <Link className="apps-btn" to="/apps/new">
            New app
          </Link>
        </div>
      </div>

      {error ? <p className="apps-error">{error}</p> : null}

      {apps === null && !error ? (
        <p className="apps-muted">Loading apps…</p>
      ) : null}

      {apps !== null && apps.length === 0 && !error ? (
        <p className="apps-empty">
          No apps yet. <Link to="/apps/new">Create one</Link>
        </p>
      ) : null}

      {apps !== null && apps.length > 0 ? (
        <div className="apps-table-wrap">
          <table className="apps-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">ID</th>
                <th scope="col">Path</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id}>
                  <td>
                    <Link to={`/apps/${app.id}`}>{app.name}</Link>
                  </td>
                  <td>
                    <code>{app.id}</code>
                  </td>
                  <td className={app.path ? undefined : 'apps-muted'}>
                    {app.path ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

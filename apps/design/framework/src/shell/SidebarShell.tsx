import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { subscribeCanvasesChanged } from '@/lib/canvasEvents'
import type { AppConfig, CanvasEntry } from '@/lib/types'
import './SidebarShell.css'

type SidebarShellProps = {
  children: ReactNode
}

type AppNode = {
  app: AppConfig
  canvases: CanvasEntry[]
}

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'sidebar-shell__nav-link sidebar-shell__nav-link--active'
    : 'sidebar-shell__nav-link'
}

function canvasLinkClassName({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'sidebar-shell__nav-link sidebar-shell__nav-link--canvas sidebar-shell__nav-link--active'
    : 'sidebar-shell__nav-link sidebar-shell__nav-link--canvas'
}

async function loadTree(): Promise<AppNode[]> {
  const apps = await designApi.listApps()
  const nodes = await Promise.all(
    apps.map(async (app) => {
      try {
        const canvases = await designApi.listCanvases(app.id)
        return { app, canvases }
      } catch {
        return { app, canvases: [] }
      }
    }),
  )
  return nodes
}

export function SidebarShell({ children }: SidebarShellProps) {
  const [nodes, setNodes] = useState<AppNode[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    function refresh() {
      loadTree().then(
        (next) => {
          if (!cancelled) setNodes(next)
        },
        () => {
          // listApps itself failed (e.g. dev server unavailable); leave the
          // tree as-is rather than surfacing an unhandled rejection.
        },
      )
    }
    refresh()
    const unsubscribe = subscribeCanvasesChanged(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  function toggle(appId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) next.delete(appId)
      else next.add(appId)
      return next
    })
  }

  return (
    <div className="sidebar-shell">
      <header className="sidebar-shell__header">
        <div className="sidebar-shell__brand">
          <div className="sidebar-shell__logo" aria-hidden="true">
            D
          </div>
          <span className="sidebar-shell__title">Design Engineering</span>
        </div>
        <div className="sidebar-shell__header-spacer" />
      </header>

      <aside className="sidebar-shell__sidebar">
        <nav className="sidebar-shell__nav" aria-label="Primary">
          <NavLink to="/" end className={navLinkClassName}>
            Apps
          </NavLink>

          {nodes.map(({ app, canvases }) => {
            const isCollapsed = collapsed.has(app.id)
            return (
              <div className="sidebar-shell__app-node" key={app.id}>
                <div className="sidebar-shell__app-row">
                  <button
                    type="button"
                    className="sidebar-shell__toggle"
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed ? `Expand ${app.name}` : `Collapse ${app.name}`
                    }
                    onClick={() => toggle(app.id)}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                  <NavLink to={`/apps/${app.id}`} className={navLinkClassName}>
                    {app.name}
                  </NavLink>
                </div>

                {!isCollapsed
                  ? canvases.map((canvas) => (
                      <NavLink
                        key={canvas.id}
                        to={`/apps/${app.id}/canvases/${canvas.id}`}
                        className={canvasLinkClassName}
                      >
                        {canvas.name}
                      </NavLink>
                    ))
                  : null}
              </div>
            )
          })}
        </nav>
      </aside>

      <main className="sidebar-shell__main">{children}</main>
    </div>
  )
}

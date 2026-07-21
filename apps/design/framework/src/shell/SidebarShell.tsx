import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { designApi } from '@/lib/api'
import { subscribeCanvasesChanged } from '@/lib/canvasEvents'
import { getTheme, setTheme, subscribeTheme, type ThemeMode } from '@/lib/theme'
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

function AppsIcon() {
  return (
    <svg
      className="sidebar-shell__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg
      className="sidebar-shell__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  )
}

function CanvasIcon() {
  return (
    <svg
      className="sidebar-shell__icon sidebar-shell__icon--sm"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function AssetsIcon() {
  return (
    <svg
      className="sidebar-shell__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 7l8-4 8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 17l8 4 8-4" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={
        open
          ? 'sidebar-shell__chevron sidebar-shell__chevron--open'
          : 'sidebar-shell__chevron'
      }
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
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
  const [theme, setThemeState] = useState<ThemeMode>(() => getTheme())

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

  useEffect(() => subscribeTheme(setThemeState), [])

  function toggle(appId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) next.delete(appId)
      else next.add(appId)
      return next
    })
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
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
        <button
          type="button"
          className="sidebar-shell__theme-toggle"
          onClick={toggleTheme}
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <aside className="sidebar-shell__sidebar">
        <nav className="sidebar-shell__nav" aria-label="Primary">
          <NavLink to="/" end className={navLinkClassName}>
            <AppsIcon />
            <span className="sidebar-shell__nav-link-text">Apps</span>
          </NavLink>

          <div className="sidebar-shell__group-label">Assets</div>
          <NavLink to="/assets/rule" className={navLinkClassName}>
            <AssetsIcon />
            <span className="sidebar-shell__nav-link-text">Rule</span>
          </NavLink>
          <NavLink to="/assets/layout" className={navLinkClassName}>
            <AssetsIcon />
            <span className="sidebar-shell__nav-link-text">Layout</span>
          </NavLink>

          {nodes.length > 0 ? (
            <div className="sidebar-shell__group-label">Workspace</div>
          ) : null}

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
                    <ChevronIcon open={!isCollapsed} />
                  </button>
                  <NavLink to={`/apps/${app.id}`} className={navLinkClassName}>
                    <FolderIcon />
                    <span className="sidebar-shell__nav-link-text">
                      {app.name}
                    </span>
                  </NavLink>
                </div>

                {!isCollapsed
                  ? canvases.map((canvas) => (
                      <NavLink
                        key={canvas.id}
                        to={`/apps/${app.id}/canvases/${canvas.id}`}
                        className={canvasLinkClassName}
                      >
                        <CanvasIcon />
                        <span className="sidebar-shell__nav-link-text">
                          {canvas.name}
                        </span>
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

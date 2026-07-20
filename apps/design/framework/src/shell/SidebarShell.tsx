import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import './SidebarShell.css'

type SidebarShellProps = {
  children: ReactNode
}

export function SidebarShell({ children }: SidebarShellProps) {
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
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive
                ? 'sidebar-shell__nav-link sidebar-shell__nav-link--active'
                : 'sidebar-shell__nav-link'
            }
          >
            Apps
          </NavLink>
          <NavLink
            to="/apps/new"
            className={({ isActive }) =>
              isActive
                ? 'sidebar-shell__nav-link sidebar-shell__nav-link--active'
                : 'sidebar-shell__nav-link'
            }
          >
            New app
          </NavLink>
        </nav>
      </aside>

      <main className="sidebar-shell__main">{children}</main>
    </div>
  )
}

// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/api', () => ({
  designApi: {
    listApps: vi.fn(async () => [
      {
        id: 'acme',
        name: 'Acme',
        path: 'apps/acme',
        style: { light: 'default', dark: 'dashboard' },
        layouts: ['sidebar-shell'],
      },
    ]),
    listCanvases: vi.fn(async () => [
      { id: 'home', name: 'Home', component: 'HomeCanvas' },
    ]),
  },
}))
vi.mock('@/lib/canvasEvents', () => ({
  subscribeCanvasesChanged: () => () => {},
}))
vi.mock('@/lib/theme', () => ({
  getTheme: () => 'dark',
  setTheme: vi.fn(),
  subscribeTheme: () => () => {},
}))
vi.mock('./assistant/availability', () => ({
  useAssistantAvailability: () => ({ available: true }),
}))
vi.mock('./assistant/AssistantProvider', () => ({
  AssistantProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('./assistant/AssistantPanel', () => ({
  AssistantPanel: ({
    open,
    onClose,
  }: {
    open: boolean
    onClose: () => void
  }) =>
    open ? (
      <aside aria-label="AI Assistant">
        <button type="button" onClick={onClose}>
          Close panel
        </button>
      </aside>
    ) : null,
}))

import { SidebarShell } from './SidebarShell'

afterEach(cleanup)

describe('SidebarShell', () => {
  it('anchors Settings in System and marks the assistant-open layout', async () => {
    render(
      <MemoryRouter>
        <SidebarShell>
          <div>Main content</div>
        </SidebarShell>
      </MemoryRouter>,
    )

    await screen.findByText('Acme')
    const system = screen.getByRole('navigation', { name: 'System' })
    expect(system.querySelector('a[href="/settings"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }))
    expect(document.querySelector('.sidebar-shell--assistant-open')).toBeTruthy()
    expect(screen.getByLabelText('AI Assistant')).toBeTruthy()
  })

  it('returns focus to the launcher when the assistant closes', async () => {
    render(
      <MemoryRouter>
        <SidebarShell>
          <div>Main content</div>
        </SidebarShell>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Open assistant' }),
      ),
    )
  })
})

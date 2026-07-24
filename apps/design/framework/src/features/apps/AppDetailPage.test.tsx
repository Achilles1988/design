// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'

const events = vi.hoisted(() => ({
  emitCanvasesChanged: vi.fn(),
}))

const api = vi.hoisted(() => ({
  getApp: vi.fn(async (id: string) => ({
    id,
    name: id === 'acme' ? 'Acme' : 'Beta',
    path: `apps/${id}`,
    style: 'dashboard',
    layouts: ['sidebar-shell'],
  })),
  listCanvases: vi.fn(async () => [
    { id: 'home', name: 'Home', component: 'HomeCanvas' },
  ]),
  listAssets: vi.fn(async () => []),
  addCanvas: vi.fn(async () => ({
    id: 'reports',
    name: 'Reports',
    component: 'ReportsCanvas',
  })),
  deleteCanvas: vi.fn(),
  removeAppLayout: vi.fn(),
  applyAsset: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ designApi: api }))
vi.mock('@/lib/confirmTip', () => ({
  confirmTip: vi.fn(async () => true),
}))
vi.mock('@/lib/canvasEvents', () => events)

import { AppDetailPage } from './AppDetailPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function RoutePage({ withSwitcher = false }: { withSwitcher?: boolean }) {
  const navigate = useNavigate()

  return (
    <>
      {withSwitcher ? (
        <button type="button" onClick={() => navigate('/apps/beta')}>
          Switch app
        </button>
      ) : null}
      <AppDetailPage />
    </>
  )
}

function renderPage(withSwitcher = false) {
  return render(
    <MemoryRouter initialEntries={['/apps/acme']}>
      <Routes>
        <Route path="/apps/:id" element={<RoutePage withSwitcher={withSwitcher} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppDetailPage', () => {
  it('hides Add Canvas fields initially and has no App delete action', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Canvases' })
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete app' })).toBeNull()
  })

  it('expands and cancels Add Canvas in place while preserving focus', async () => {
    renderPage()

    const trigger = await screen.findByRole('button', { name: 'Add canvas' })
    fireEvent.click(trigger)
    const name = screen.getByLabelText('Name')
    await waitFor(() => expect(document.activeElement).toBe(name))
    expect(
      document.querySelector('button[aria-controls="add-canvas-form"]'),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Name')).toBeNull()
    const restoredTrigger = screen.getByRole('button', { name: 'Add canvas' })
    await waitFor(() => expect(document.activeElement).toBe(restoredTrigger))
  })

  it('marks Canvas ID as required and associates its guidance', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add canvas' }))
    const id = screen.getByLabelText('ID')
    expect(id.hasAttribute('required')).toBe(true)
    expect(id.getAttribute('aria-describedby')).toContain('canvas-id-hint')
  })

  it('resets the disclosure when switching to another App', async () => {
    renderPage(true)

    fireEvent.click(await screen.findByRole('button', { name: 'Add canvas' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Switch app' }))

    await screen.findByRole('heading', { name: 'Beta' })
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('collapses after a successful creation', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Add canvas' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Reports' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add canvas' }))

    await waitFor(() => expect(api.addCanvas).toHaveBeenCalledTimes(1))
    expect(events.emitCanvasesChanged).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull())
  })
})

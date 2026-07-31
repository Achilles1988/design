// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'

const events = vi.hoisted(() => ({
  emitCanvasesChanged: vi.fn(),
}))

const canvasRenameNotice = vi.hoisted(() => ({
  writeCanvasRenameNotice: vi.fn(),
}))

const api = vi.hoisted(() => ({
  getApp: vi.fn(async (id: string) => ({
    id,
    name: id === 'acme' ? 'Acme' : 'Beta',
    path: `apps/${id}`,
    style: { dark: 'dashboard' },
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
  renameCanvas: vi.fn(async () => ({
    id: 'landing',
    name: 'Landing',
    component: 'Landing.tsx',
  })),
  deleteCanvas: vi.fn(),
  removeAppLayout: vi.fn(),
  removeAppStyle: vi.fn(),
  applyAsset: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ designApi: api }))
vi.mock('@/lib/confirmTip', () => ({
  confirmTip: vi.fn(async () => true),
}))
vi.mock('@/lib/canvasEvents', () => events)
vi.mock('@/lib/canvasRenameNotice', () => canvasRenameNotice)

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

  it('edits a canvas inline and saves the rename', async () => {
    renderPage()

    await screen.findByRole('link', { name: 'Home' })
    const edit = screen.getByRole('button', { name: 'Edit canvas Home' })
    fireEvent.click(edit)

    const name = screen.getByLabelText('Name')
    const id = screen.getByLabelText('ID')
    fireEvent.change(name, { target: { value: 'Landing' } })
    fireEvent.change(id, { target: { value: 'landing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.renameCanvas).toHaveBeenCalledWith('acme', 'home', {
        id: 'landing',
        name: 'Landing',
      }),
    )
    expect(canvasRenameNotice.writeCanvasRenameNotice).toHaveBeenCalledWith({
      appId: 'acme',
      fromId: 'home',
      toId: 'landing',
      name: 'Landing',
    })
    expect(events.emitCanvasesChanged).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull())
    expect(screen.getByRole('button', { name: 'Edit canvas Home' })).toBeTruthy()
  })

  it('keeps edit mode when rename fails', async () => {
    api.renameCanvas.mockRejectedValueOnce(new Error('Rename failed'))
    renderPage()

    await screen.findByRole('link', { name: 'Home' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit canvas Home' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Landing' },
    })
    fireEvent.change(screen.getByLabelText('ID'), {
      target: { value: 'landing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.renameCanvas).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByText('Rename failed')).toBeTruthy()
    expect(canvasRenameNotice.writeCanvasRenameNotice).not.toHaveBeenCalled()
  })

  it('keeps edit mode when the canvas id is invalid', async () => {
    renderPage()

    await screen.findByRole('link', { name: 'Home' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit canvas Home' }))
    fireEvent.change(screen.getByLabelText('ID'), {
      target: { value: 'Bad Id' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(api.renameCanvas).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('ID')).toBeTruthy()
  })

  it('shows a Light row with a link to set the missing style', async () => {
    renderPage()

    await screen.findByText('Light')
    expect(screen.getByText('—')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Set light style' })
    expect(link.getAttribute('href')).toBe('/assets/rule?appId=acme&slot=light')
    expect(screen.queryByRole('button', { name: 'Clear light style' })).toBeNull()
  })

  it('shows a Dark row with the installed style, an Edit link, and a Clear button', async () => {
    renderPage()

    const code = await screen.findByText('dashboard')
    expect(code.tagName).toBe('CODE')
    const link = screen.getByRole('link', { name: 'Edit dark style dashboard' })
    expect(link.getAttribute('href')).toBe('/assets/rule?appId=acme&slot=dark')
    expect(screen.getByRole('button', { name: 'Clear dark style' })).toBeTruthy()
  })

  it('clears the dark style and refreshes from the returned App', async () => {
    api.removeAppStyle.mockResolvedValueOnce({
      id: 'acme',
      name: 'Acme',
      path: 'apps/acme',
      style: {},
      layouts: ['sidebar-shell'],
    })
    renderPage()

    await screen.findByText('dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Clear dark style' }))

    await waitFor(() =>
      expect(api.removeAppStyle).toHaveBeenCalledWith('acme', 'dark'),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Clear dark style' }),
      ).toBeNull(),
    )
    expect(screen.getByRole('link', { name: 'Set dark style' })).toBeTruthy()
  })

  it('cancels edit mode without calling rename', async () => {
    renderPage()

    await screen.findByRole('link', { name: 'Home' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit canvas Home' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Landing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(api.renameCanvas).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy()
  })
})

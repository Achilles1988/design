// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppConfig, AssetEntry } from '@/lib/types'

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
  listApps: vi.fn(),
  getApp: vi.fn(),
  applyAsset: vi.fn(),
  downloadAssetUrl: vi.fn(() => '/download'),
}))

const chooseStyleSlotMock = vi.hoisted(() => vi.fn())
const confirmTipMock = vi.hoisted(() => vi.fn(async () => true))

vi.mock('@/lib/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, designApi: api }
})
vi.mock('@/lib/chooseStyleSlot', () => ({
  chooseStyleSlot: chooseStyleSlotMock,
}))
vi.mock('@/lib/confirmTip', () => ({ confirmTip: confirmTipMock }))
vi.mock('@/shell/assistant/usePageAssistant', () => ({
  usePageAssistant: () => {},
}))
vi.mock('./usePersistentAssetFilter', () => ({
  usePersistentAssetFilter: () => ({
    filter: { chips: [] },
    filterRef: { current: { chips: [] } },
    owner: { pageKey: 'test', generation: 1 },
    setFilter: vi.fn(),
    resetFilter: vi.fn(),
  }),
}))

import { DesignFsError } from '@/lib/api'
import { AssetsRulePage } from './AssetBrowserPage'

const ENTRY: AssetEntry = {
  id: 'style-a',
  name: 'style-a',
  previewUrl: '/assets/designmd/style-a/components.html',
}

const APP: AppConfig = {
  id: 'acme',
  name: 'Acme',
  style: {},
  layouts: ['sidebar-shell'],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assets/rule']}>
      <AssetsRulePage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AssetBrowserPage runApply', () => {
  it('retries with the chosen slot on 409 needsSlot and reports it in the notice', async () => {
    api.listAssets.mockResolvedValue([ENTRY])
    api.listApps.mockResolvedValue([APP])
    api.getApp.mockResolvedValue({ ...APP, style: {} })
    chooseStyleSlotMock.mockResolvedValue('both')
    api.applyAsset
      .mockRejectedValueOnce(
        new DesignFsError('Choose Light, Dark, or Both for this style.', 409, {
          needsSlot: true,
          options: ['light', 'dark', 'both'],
        }),
      )
      .mockResolvedValueOnce({
        ...APP,
        style: { light: 'style-a', dark: 'style-a' },
      })

    renderPage()
    const install = await screen.findByRole('button', { name: 'Install style' })
    fireEvent.click(install)

    await waitFor(() => expect(chooseStyleSlotMock).toHaveBeenCalledWith(['light', 'dark', 'both']))
    await waitFor(() => expect(api.applyAsset).toHaveBeenCalledTimes(2))
    expect(api.applyAsset).toHaveBeenNthCalledWith(1, 'designmd', 'style-a', 'acme', undefined)
    expect(api.applyAsset).toHaveBeenNthCalledWith(2, 'designmd', 'style-a', 'acme', 'both')

    await waitFor(() => {
      const notice = screen.getByText(/Installed style on/)
      expect(notice.textContent).toContain('both')
    })
  })

  it('does not retry when the slot chooser is cancelled', async () => {
    api.listAssets.mockResolvedValue([ENTRY])
    api.listApps.mockResolvedValue([APP])
    api.getApp.mockResolvedValue({ ...APP, style: {} })
    chooseStyleSlotMock.mockResolvedValue(null)
    api.applyAsset.mockRejectedValueOnce(
      new DesignFsError('Choose Light, Dark, or Both for this style.', 409, {
        needsSlot: true,
        options: ['light', 'dark', 'both'],
      }),
    )

    renderPage()
    const install = await screen.findByRole('button', { name: 'Install style' })
    fireEvent.click(install)

    await waitFor(() => expect(chooseStyleSlotMock).toHaveBeenCalledWith(['light', 'dark', 'both']))
    await waitFor(() => expect(api.applyAsset).toHaveBeenCalledTimes(1))

    expect(screen.queryByText(/Installed style on/)).toBeNull()
  })
})

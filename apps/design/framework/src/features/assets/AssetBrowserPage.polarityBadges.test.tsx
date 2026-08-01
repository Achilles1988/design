// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AssetEntry } from '@/lib/types'

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
  listApps: vi.fn(async () => []),
  getApp: vi.fn(),
  applyAsset: vi.fn(),
  downloadAssetUrl: vi.fn(() => '/download'),
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, designApi: api }
})
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

import { AssetsLayoutPage, AssetsRulePage } from './AssetBrowserPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function cardFor(id: string): HTMLElement {
  const idNode = screen.getByText(id)
  const card = idNode.closest('[role="listitem"]')
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Missing card for ${id}`)
  }
  return card
}

describe('Rule polarity badges', () => {
  it('shows supported slots beside each Rule asset name', async () => {
    const entries: AssetEntry[] = [
      {
        id: 'sunny',
        name: 'sunny',
        previewUrl: '/assets/designmd/sunny/components.html',
        slots: ['light'],
      },
      {
        id: 'midnight',
        name: 'midnight',
        previewUrl: '/assets/designmd/midnight/components.html',
        slots: ['dark'],
      },
      {
        id: 'dual',
        name: 'dual',
        previewUrl: '/assets/designmd/dual/components.html',
        slots: ['light', 'dark'],
      },
    ]
    api.listAssets.mockResolvedValue(entries)
    render(
      <MemoryRouter initialEntries={['/assets/rule']}>
        <AssetsRulePage />
      </MemoryRouter>,
    )

    await screen.findByText('sunny')

    const sunny = cardFor('sunny')
    expect(within(sunny).getByText('light')).toBeTruthy()
    expect(within(sunny).queryByText('dark')).toBeNull()
    expect(
      within(sunny).queryByRole('button', { name: 'Open preview for sunny' })
        ?.textContent,
    ).not.toMatch(/light|dark/)

    const midnight = cardFor('midnight')
    expect(within(midnight).getByText('dark')).toBeTruthy()
    expect(within(midnight).queryByText('light')).toBeNull()

    const dual = cardFor('dual')
    expect(within(dual).getByText('light')).toBeTruthy()
    expect(within(dual).getByText('dark')).toBeTruthy()
  })

  it('does not show polarity badges on Layout cards', async () => {
    api.listAssets.mockResolvedValue([
      {
        id: 'shell',
        name: 'shell',
        previewUrl: '/assets/layoutmd/shell/preview.html',
      },
    ])
    render(
      <MemoryRouter initialEntries={['/assets/layout']}>
        <AssetsLayoutPage />
      </MemoryRouter>,
    )
    await screen.findByText('shell')
    const card = cardFor('shell')
    expect(within(card).queryByText('light')).toBeNull()
    expect(within(card).queryByText('dark')).toBeNull()
  })
})

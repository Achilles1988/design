// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/ai/config', () => ({
  hasValidConfig: () => false,
}))

import { AssistantPanel } from './AssistantPanel'

afterEach(() => {
  cleanup()
})

function renderPanel(open: boolean) {
  return render(
    <MemoryRouter>
      <AssistantPanel open={open} onClose={() => {}} />
    </MemoryRouter>,
  )
}

describe('AssistantPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the configuration guidance when no provider is configured', () => {
    renderPanel(true)
    expect(screen.getByRole('dialog', { name: 'AI 助手' })).toBeTruthy()
    expect(screen.getByText(/请先配置 AI provider/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '打开 Settings' })).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('renders a nonmodal English assistant region', () => {
    renderPanel(true)

    expect(
      screen.getByRole('complementary', { name: 'AI Assistant' }),
    ).toBeTruthy()
    expect(
      screen.getByText('Configure an AI provider before starting a conversation.'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeTruthy()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close assistant' }),
    )
    expect(document.querySelector('.assistant-overlay__scrim')).toBeNull()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <AssistantPanel open onClose={onClose} />
      </MemoryRouter>,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

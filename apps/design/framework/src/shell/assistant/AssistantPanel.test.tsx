// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Ref } from 'react'

const { confirmTipMock, hasValidConfigMock, session } = vi.hoisted(() => ({
  confirmTipMock: vi.fn(),
  hasValidConfigMock: vi.fn(() => false),
  session: {
    hasState: false,
    persistenceError: null as string | null,
    startNewChat: vi.fn(),
  },
}))

vi.mock('@/lib/ai/config', () => ({
  hasValidConfig: hasValidConfigMock,
}))
vi.mock('@/lib/confirmTip', () => ({
  confirmTip: confirmTipMock,
}))
vi.mock('./pageSession', () => ({
  useAssistantPageSession: () => session,
}))
vi.mock('./AssistantThread', () => ({
  AssistantThread: ({ composerInputRef }: { composerInputRef?: Ref<HTMLTextAreaElement> }) => (
    <textarea ref={composerInputRef} aria-label="Assistant composer" />
  ),
}))

import { AssistantPanel } from './AssistantPanel'

afterEach(() => {
  cleanup()
  hasValidConfigMock.mockReset()
  hasValidConfigMock.mockReturnValue(false)
  confirmTipMock.mockReset()
  session.hasState = false
  session.persistenceError = null
  session.startNewChat.mockReset()
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

  it('confirms and starts a new chat when the page has state', async () => {
    hasValidConfigMock.mockReturnValue(true)
    confirmTipMock.mockResolvedValue(true)
    session.hasState = true
    renderPanel(true)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    await waitFor(() => expect(confirmTipMock).toHaveBeenCalledWith({
      message: 'Start a new chat? This clears the conversation and filters for this page.',
      confirmLabel: 'Start new chat',
      danger: false,
    }))
    expect(session.startNewChat).toHaveBeenCalledTimes(1)
  })

  it('starts a new chat without confirmation when the page is empty', () => {
    hasValidConfigMock.mockReturnValue(true)
    renderPanel(true)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    expect(confirmTipMock).not.toHaveBeenCalled()
    expect(session.startNewChat).toHaveBeenCalledTimes(1)
  })

  it('keeps the page state when new chat confirmation is cancelled', async () => {
    hasValidConfigMock.mockReturnValue(true)
    confirmTipMock.mockResolvedValue(false)
    session.hasState = true
    renderPanel(true)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    await waitFor(() => expect(confirmTipMock).toHaveBeenCalledTimes(1))
    expect(session.startNewChat).not.toHaveBeenCalled()
  })

  it('focuses the composer after starting a new chat', async () => {
    hasValidConfigMock.mockReturnValue(true)
    renderPanel(true)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Assistant composer' }),
    ))
  })

  it('shows a persistence warning when page state cannot be saved', () => {
    hasValidConfigMock.mockReturnValue(true)
    session.persistenceError = 'Storage is unavailable'
    renderPanel(true)

    expect(screen.getByRole('status').textContent).toContain(
      'Your conversation is available for this session but could not be saved.',
    )
  })
})

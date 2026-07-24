// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Ref } from 'react'

const { confirmTipMock, hasValidConfigMock, session } = vi.hoisted(() => ({
  confirmTipMock: vi.fn(),
  hasValidConfigMock: vi.fn(() => false),
  session: {
    owner: { pageKey: '/source', generation: 1 },
    ready: true,
    hasState: false,
    persistenceError: null as string | null,
    startNewChat: vi.fn(() => true),
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
    <>
      <p>Old conversation</p>
      <textarea ref={composerInputRef} aria-label="Assistant composer" />
    </>
  ),
}))

import { AssistantPanel } from './AssistantPanel'

afterEach(() => {
  cleanup()
  hasValidConfigMock.mockReset()
  hasValidConfigMock.mockReturnValue(false)
  confirmTipMock.mockReset()
  session.ready = true
  session.owner = { pageKey: '/source', generation: 1 }
  session.hasState = false
  session.persistenceError = null
  session.startNewChat.mockReset()
  session.startNewChat.mockReturnValue(true)
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
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull()
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

  it('does not close on Escape while an alert dialog is active', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <AssistantPanel open onClose={onClose} />
        <div role="alertdialog" aria-label="Confirm new chat" />
      </MemoryRouter>,
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
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
    expect(session.startNewChat).toHaveBeenCalledWith(session.owner)
  })

  it('starts a new chat without confirmation when the page is empty', () => {
    hasValidConfigMock.mockReturnValue(true)
    renderPanel(true)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

    expect(confirmTipMock).not.toHaveBeenCalled()
    expect(session.startNewChat).toHaveBeenCalledWith(session.owner)
  })

  it('hides the previous conversation while the destination page is loading', () => {
    hasValidConfigMock.mockReturnValue(true)
    session.ready = false
    renderPanel(true)

    expect(screen.getByRole('status').textContent).toBe(
      'Loading conversation…',
    )
    expect(screen.queryByText('Old conversation')).toBeNull()
    expect(
      screen.queryByRole('textbox', { name: 'Assistant composer' }),
    ).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'New chat' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('expires a pending confirmation when its page owner changes', async () => {
    hasValidConfigMock.mockReturnValue(true)
    session.hasState = true
    let resolveConfirmation = (_confirmed: boolean) => {}
    confirmTipMock.mockReturnValue(new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve
    }))
    const rendered = renderPanel(true)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    await waitFor(() => expect(confirmTipMock).toHaveBeenCalledTimes(1))

    session.owner = { pageKey: '/destination', generation: 2 }
    rendered.rerender(
      <MemoryRouter>
        <AssistantPanel open onClose={() => {}} />
      </MemoryRouter>,
    )
    resolveConfirmation(true)
    await Promise.resolve()

    expect(session.startNewChat).not.toHaveBeenCalled()
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

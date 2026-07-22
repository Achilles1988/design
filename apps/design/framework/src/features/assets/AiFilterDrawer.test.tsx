// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AiFilterDrawer } from './AiFilterDrawer'
import { clearAiConfig, writeAiConfig } from '@/lib/ai/config'
import { emptyFilter } from '@/lib/ai/filterState'
import type { Reply } from '@/lib/ai/schema'

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

afterEach(() => {
  clearAiConfig()
  cleanup()
})

describe('AiFilterDrawer', () => {
  it('shows config guidance when no AI configured', () => {
    render(
      wrap(
        <AiFilterDrawer
          open
          kind="designmd"
          index={[]}
          filter={emptyFilter()}
          onFilterChange={vi.fn()}
          basePrompt="# base"
          matchCount={0}
          totalCount={0}
          onClose={vi.fn()}
        />,
      ),
    )
    expect(screen.getByText(/Configure your AI provider/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open Settings/i })).toBeTruthy()
  })

  it('closes on ESC', () => {
    writeAiConfig({ provider: 'anthropic', apiKey: 'sk', model: 'claude-sonnet-4-6' })
    const onClose = vi.fn()
    render(
      wrap(
        <AiFilterDrawer
          open
          kind="designmd"
          index={[]}
          filter={emptyFilter()}
          onFilterChange={vi.fn()}
          basePrompt="# base"
          matchCount={0}
          totalCount={0}
          onClose={onClose}
        />,
      ),
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('sends a message via injected sendTurn', async () => {
    writeAiConfig({ provider: 'anthropic', apiKey: 'sk', model: 'claude-sonnet-4-6' })
    const replyValue: Reply = {
      is_relevant: true,
      reply: 'hello',
      filter_delta: { add: [], remove: [] },
    }
    const sendTurn = vi.fn().mockResolvedValue(replyValue)
    const onFilterChange = vi.fn()
    render(
      wrap(
        <AiFilterDrawer
          open
          kind="designmd"
          index={[]}
          filter={emptyFilter()}
          onFilterChange={onFilterChange}
          basePrompt="# base"
          matchCount={0}
          totalCount={0}
          onClose={vi.fn()}
          sendTurn={sendTurn}
        />,
      ),
    )
    const input = screen.getByPlaceholderText(/tell me/i) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /Send/i }))
    // wait for microtasks
    await new Promise((r) => setTimeout(r, 0))
    expect(sendTurn).toHaveBeenCalled()
    expect(await screen.findByText('hello')).toBeTruthy()
  })
})

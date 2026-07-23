// @vitest-environment jsdom
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AssistantAvailabilityProvider, useAssistantAvailability } from './availability'
import { AssistantLauncher } from './AssistantLauncher'

afterEach(() => {
  cleanup()
})

function MarkAvailable() {
  const { setAvailable } = useAssistantAvailability()
  useEffect(() => {
    setAvailable(true)
  }, [setAvailable])
  return null
}

describe('AssistantLauncher', () => {
  it('renders nothing when the assistant is unavailable', () => {
    render(
      <AssistantAvailabilityProvider>
        <AssistantLauncher open={false} onToggle={() => {}} />
      </AssistantAvailabilityProvider>,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a toggle button when available and fires onToggle', () => {
    const onToggle = vi.fn()
    render(
      <AssistantAvailabilityProvider>
        <MarkAvailable />
        <AssistantLauncher open={false} onToggle={onToggle} />
      </AssistantAvailabilityProvider>,
    )
    const btn = screen.getByRole('button', { name: 'Open assistant' })
    btn.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

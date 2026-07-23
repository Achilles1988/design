// @vitest-environment jsdom
import { afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

afterEach(() => {
  cleanup()
})
import { AssistantAvailabilityProvider, useAssistantAvailability } from './availability'

function Probe() {
  const { available, setAvailable } = useAssistantAvailability()
  return (
    <div>
      <span data-testid="v">{String(available)}</span>
      <button onClick={() => setAvailable(true)}>on</button>
    </div>
  )
}

describe('AssistantAvailability', () => {
  it('defaults to false and flips on setAvailable', () => {
    render(
      <AssistantAvailabilityProvider>
        <Probe />
      </AssistantAvailabilityProvider>,
    )
    expect(screen.getByTestId('v').textContent).toBe('false')
    act(() => {
      screen.getByText('on').click()
    })
    expect(screen.getByTestId('v').textContent).toBe('true')
  })
})

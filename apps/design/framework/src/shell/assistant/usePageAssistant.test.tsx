// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const instructionsSpy = vi.fn()
vi.mock('@assistant-ui/react', () => ({
  useAssistantInstructions: (v: string) => instructionsSpy(v),
}))

import { AssistantAvailabilityProvider, useAssistantAvailability } from './availability'
import { usePageAssistant } from './usePageAssistant'

afterEach(() => {
  cleanup()
  instructionsSpy.mockClear()
})

let observed = false
function Observer() {
  observed = useAssistantAvailability().available
  return null
}
function Page() {
  usePageAssistant({ instructions: 'do filtering', available: true })
  return null
}

describe('usePageAssistant', () => {
  it('registers instructions and marks availability on mount', () => {
    render(
      <AssistantAvailabilityProvider>
        <Observer />
        <Page />
      </AssistantAvailabilityProvider>,
    )
    expect(instructionsSpy).toHaveBeenCalledWith('do filtering')
    expect(observed).toBe(true)
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const instructionsSpy = vi.fn()
const registerResetHandler = vi.fn(() => vi.fn())
vi.mock('@assistant-ui/react', () => ({
  useAssistantInstructions: (v: string) => instructionsSpy(v),
}))
vi.mock('./pageSession', () => ({
  useAssistantPageSession: () => ({ registerResetHandler }),
}))

import { AssistantAvailabilityProvider, useAssistantAvailability } from './availability'
import { usePageAssistant } from './usePageAssistant'

afterEach(() => {
  cleanup()
  instructionsSpy.mockClear()
  registerResetHandler.mockClear()
})

let observed = false
function Observer() {
  observed = useAssistantAvailability().available
  return null
}
function Page({ onReset }: { onReset?: () => void }) {
  usePageAssistant({
    instructions: 'do filtering',
    available: true,
    onResetPageState: onReset,
  })
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

  it('registers and unregisters the page reset handler', () => {
    const unregister = vi.fn()
    registerResetHandler.mockReturnValue(unregister)
    const onReset = vi.fn()
    const view = render(
      <AssistantAvailabilityProvider>
        <Page onReset={onReset} />
      </AssistantAvailabilityProvider>,
    )

    expect(registerResetHandler).toHaveBeenCalledWith(onReset)

    view.unmount()

    expect(unregister).toHaveBeenCalledTimes(1)
  })
})

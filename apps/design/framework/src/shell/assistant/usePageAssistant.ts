import { useEffect } from 'react'
import { useAssistantInstructions } from '@assistant-ui/react'
import { useAssistantAvailability } from './availability'
import { useAssistantPageSession } from './pageSession'

export type UsePageAssistantOptions = {
  instructions: string
  available?: boolean
  onResetPageState?: () => void
}

export function usePageAssistant({
  instructions,
  available = true,
  onResetPageState,
}: UsePageAssistantOptions): void {
  useAssistantInstructions(instructions)
  const { setAvailable } = useAssistantAvailability()
  const { registerResetHandler } = useAssistantPageSession()

  useEffect(() => {
    setAvailable(available)
    return () => setAvailable(false)
  }, [available, setAvailable])

  useEffect(() => {
    if (!onResetPageState) return
    return registerResetHandler(onResetPageState)
  }, [onResetPageState, registerResetHandler])
}

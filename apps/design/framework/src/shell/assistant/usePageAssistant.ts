import { useEffect } from 'react'
import { useAssistantInstructions } from '@assistant-ui/react'
import { useAssistantAvailability } from './availability'

export type UsePageAssistantOptions = {
  instructions: string
  available?: boolean
}

export function usePageAssistant({ instructions, available = true }: UsePageAssistantOptions): void {
  useAssistantInstructions(instructions)
  const { setAvailable } = useAssistantAvailability()
  useEffect(() => {
    setAvailable(available)
    return () => setAvailable(false)
  }, [available, setAvailable])
}

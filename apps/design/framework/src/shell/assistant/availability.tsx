import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type AvailabilityApi = { available: boolean; setAvailable: (v: boolean) => void }

const Ctx = createContext<AvailabilityApi | null>(null)

export function AssistantAvailabilityProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false)
  const value = useMemo(() => ({ available, setAvailable }), [available])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAssistantAvailability(): AvailabilityApi {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useAssistantAvailability must be used within AssistantAvailabilityProvider')
  }
  return ctx
}

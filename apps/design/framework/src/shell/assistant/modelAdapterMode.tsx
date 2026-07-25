import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { ChatModelAdapter } from '@assistant-ui/react'

type ModelModeApi = {
  getPageAdapter: () => ChatModelAdapter | null
  setPageAdapter: (adapter: ChatModelAdapter | null) => void
}

const ModelModeContext = createContext<ModelModeApi | null>(null)

export function createDelegatingChatModelAdapter(
  defaultAdapter: ChatModelAdapter,
  getPageAdapter: () => ChatModelAdapter | null,
): ChatModelAdapter {
  return {
    run(options) {
      return (getPageAdapter() ?? defaultAdapter).run(options)
    },
  }
}

export function AssistantModelModeProvider({
  api,
  children,
}: {
  api: ModelModeApi
  children: ReactNode
}) {
  return (
    <ModelModeContext.Provider value={api}>
      {children}
    </ModelModeContext.Provider>
  )
}

export function usePageModelAdapter(adapter: ChatModelAdapter | null): void {
  const context = useContext(ModelModeContext)
  if (!context) {
    throw new Error(
      'usePageModelAdapter must be used within AssistantModelModeProvider',
    )
  }
  useEffect(() => {
    context.setPageAdapter(adapter)
    return () => context.setPageAdapter(null)
  }, [adapter, context])
}

export function useModelModeApi(): ModelModeApi {
  const adapterRef = useRef<ChatModelAdapter | null>(null)
  return useMemo(
    () => ({
      getPageAdapter: () => adapterRef.current,
      setPageAdapter: (adapter) => {
        adapterRef.current = adapter
      },
    }),
    [],
  )
}

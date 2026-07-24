import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { AssistantRuntime } from '@assistant-ui/react'
import type { Filter } from '@/lib/ai/filterState'
import {
  clearAssistantPageState,
  createAssistantPageKey,
  patchAssistantPageState,
  readAssistantPageState,
  restoreMessages,
  serializeMessages,
  type AssistantPageStateV1,
  type StoreWriteResult,
} from './pageState'

export type AssistantPageSessionValue = {
  pageKey: string
  pageState: AssistantPageStateV1
  ready: boolean
  hasState: boolean
  persistenceError: string | null
  registerResetHandler: (handler: () => void) => () => void
  setPageFilter: (filter: Filter) => StoreWriteResult
  startNewChat: () => void
}

const AssistantPageSessionContext =
  createContext<AssistantPageSessionValue | null>(null)

function cancelRunAndWaitForIdle(
  runtime: AssistantRuntime,
  onIdle: () => void,
): () => void {
  let active = true
  let unsubscribe = () => {}
  const finish = () => {
    if (!active || runtime.thread.getState().isRunning) return
    active = false
    unsubscribe()
    onIdle()
  }

  if (runtime.thread.getState().isRunning) {
    unsubscribe = runtime.thread.subscribe(finish)
    runtime.thread.cancelRun()
    finish()
  } else {
    runtime.thread.cancelRun()
    finish()
  }

  return () => {
    active = false
    unsubscribe()
  }
}

export function useAssistantPageSession(): AssistantPageSessionValue {
  const value = useContext(AssistantPageSessionContext)
  if (!value) {
    throw new Error(
      'useAssistantPageSession must be used inside AssistantPageSessionProvider',
    )
  }
  return value
}

export function AssistantPageSessionProvider({
  runtime,
  epochRef,
  children,
}: {
  runtime: AssistantRuntime
  epochRef?: MutableRefObject<number>
  children: ReactNode
}) {
  const location = useLocation()
  const pageKey = useMemo(
    () => createAssistantPageKey(location),
    [location.pathname, location.search],
  )
  const internalEpochRef = useRef(0)
  const activeEpochRef = epochRef ?? internalEpochRef
  const activeKeyRef = useRef(pageKey)
  const hydratingRef = useRef(true)
  const resetHandlerRef = useRef<() => void>(() => {})
  const [hydratedPageKey, setHydratedPageKey] = useState<string | null>(null)
  const [pageState, setPageState] = useState(() =>
    readAssistantPageState(pageKey),
  )
  const [messageCount, setMessageCount] = useState(
    () => runtime.thread.getState().messages.length,
  )
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  const saveSnapshot = useCallback((targetPageKey: string) => {
    const result = patchAssistantPageState(targetPageKey, {
      messages: serializeMessages(runtime.thread.getState().messages),
    })
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
  }, [runtime])

  const saveMessages = useCallback(() => {
    if (hydratingRef.current || runtime.thread.getState().isRunning) return
    saveSnapshot(activeKeyRef.current)
  }, [runtime, saveSnapshot])

  const onThreadChange = useCallback(() => {
    setMessageCount(runtime.thread.getState().messages.length)
    saveMessages()
  }, [runtime, saveMessages])

  useLayoutEffect(() => {
    activeEpochRef.current += 1
    const transitionEpoch = activeEpochRef.current
    const previousPageKey = activeKeyRef.current
    if (previousPageKey !== pageKey) saveSnapshot(previousPageKey)
    hydratingRef.current = true
    setHydratedPageKey(null)

    return cancelRunAndWaitForIdle(runtime, () => {
      if (activeEpochRef.current !== transitionEpoch) return
      const restored = readAssistantPageState(pageKey)
      activeKeyRef.current = pageKey
      const restoredMessages = restoreMessages(restored.messages)
      runtime.thread.reset(restoredMessages)
      setMessageCount(restoredMessages.length)
      setPageState(restored)
      hydratingRef.current = false
      setHydratedPageKey(pageKey)
    })
  }, [activeEpochRef, pageKey, runtime, saveSnapshot])

  useLayoutEffect(
    () => runtime.thread.subscribe(onThreadChange),
    [runtime, onThreadChange],
  )

  const registerResetHandler = useCallback((handler: () => void) => {
    resetHandlerRef.current = handler
    return () => {
      if (resetHandlerRef.current === handler) {
        resetHandlerRef.current = () => {}
      }
    }
  }, [])

  const setPageFilter = useCallback((filter: Filter) => {
    const result = patchAssistantPageState(activeKeyRef.current, { filter })
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
    return result
  }, [])

  const startNewChat = useCallback(() => {
    activeEpochRef.current += 1
    const transitionEpoch = activeEpochRef.current
    const targetPageKey = pageKey
    hydratingRef.current = true
    setHydratedPageKey(null)

    cancelRunAndWaitForIdle(runtime, () => {
      if (activeEpochRef.current !== transitionEpoch) return
      activeKeyRef.current = targetPageKey
      runtime.thread.reset([])
      setMessageCount(0)
      resetHandlerRef.current()
      const result = clearAssistantPageState(targetPageKey)
      setPageState(result.state)
      setPersistenceError(result.ok ? null : result.error)
      hydratingRef.current = false
      setHydratedPageKey(targetPageKey)
    })
  }, [activeEpochRef, pageKey, runtime])

  const ready = hydratedPageKey === pageKey
  const value = useMemo<AssistantPageSessionValue>(() => ({
    pageKey,
    pageState,
    ready,
    hasState:
      messageCount > 0 || (pageState.filter?.chips.length ?? 0) > 0,
    persistenceError,
    registerResetHandler,
    setPageFilter,
    startNewChat,
  }), [
    pageKey,
    pageState,
    messageCount,
    persistenceError,
    ready,
    registerResetHandler,
    setPageFilter,
    startNewChat,
  ])

  return (
    <AssistantPageSessionContext.Provider value={value}>
      {children}
    </AssistantPageSessionContext.Provider>
  )
}

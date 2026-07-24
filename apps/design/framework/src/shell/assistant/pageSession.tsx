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

export const STALE_PAGE_FILTER_ERROR =
  'Filter update ignored because its page is no longer active.'

export type AssistantPageSessionValue = {
  pageKey: string
  pageState: AssistantPageStateV1
  ready: boolean
  hasState: boolean
  persistenceError: string | null
  registerResetHandler: (handler: () => void) => () => void
  setPageFilter: (
    ownerPageKey: string,
    filter: Filter,
  ) => PageFilterWriteResult
  startNewChat: () => void
}

export type PageFilterWriteResult =
  | ({ accepted: true } & StoreWriteResult)
  | {
      accepted: false
      ok: false
      state: AssistantPageStateV1
      error: string
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
  const latestRouteKeyRef = useRef(pageKey)
  latestRouteKeyRef.current = pageKey
  const activeKeyRef = useRef(pageKey)
  const hydratingRef = useRef(true)
  const clearingPageKeysRef = useRef(new Set<string>())
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
    if (clearingPageKeysRef.current.has(targetPageKey)) return
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
      let restored = readAssistantPageState(pageKey)
      let restoredMessages: ReturnType<typeof restoreMessages>
      activeKeyRef.current = pageKey
      try {
        restoredMessages = restoreMessages(restored.messages)
        runtime.thread.reset(restoredMessages)
      } catch {
        const cleared = clearAssistantPageState(pageKey)
        restored = cleared.state
        restoredMessages = []
        runtime.thread.reset([])
        setPersistenceError(cleared.ok ? null : cleared.error)
      }
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

  const setPageFilter = useCallback((
    ownerPageKey: string,
    filter: Filter,
  ): PageFilterWriteResult => {
    if (ownerPageKey !== latestRouteKeyRef.current) {
      return {
        accepted: false,
        ok: false,
        state: readAssistantPageState(ownerPageKey),
        error: STALE_PAGE_FILTER_ERROR,
      }
    }
    const result = patchAssistantPageState(latestRouteKeyRef.current, { filter })
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
    return { accepted: true, ...result }
  }, [])

  const startNewChat = useCallback(() => {
    activeEpochRef.current += 1
    const targetPageKey = latestRouteKeyRef.current
    clearingPageKeysRef.current.add(targetPageKey)
    hydratingRef.current = true
    setHydratedPageKey(null)

    cancelRunAndWaitForIdle(runtime, () => {
      const result = clearAssistantPageState(targetPageKey)
      setPersistenceError(result.ok ? null : result.error)
      if (latestRouteKeyRef.current === targetPageKey) {
        activeKeyRef.current = targetPageKey
        runtime.thread.reset([])
        setMessageCount(0)
        resetHandlerRef.current()
        setPageState(result.state)
        hydratingRef.current = false
        setHydratedPageKey(targetPageKey)
      }
      clearingPageKeysRef.current.delete(targetPageKey)
    })
  }, [activeEpochRef, runtime])

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

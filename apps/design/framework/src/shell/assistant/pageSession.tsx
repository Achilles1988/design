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
  readAssistantPageStateResult,
  restoreMessages,
  serializeMessages,
  type AssistantPageStateV1,
  type StoreWriteResult,
} from './pageState'
import { extractAttachmentIds } from './visualAttachmentAdapter'
import type { VisualAttachmentStore } from './visualAttachmentStore'

export const STALE_PAGE_FILTER_ERROR =
  'Filter update ignored because its page is no longer active.'

export type AssistantPageOwner = {
  pageKey: string
  generation: number
}

function isSameAssistantPageOwner(
  left: AssistantPageOwner | null,
  right: AssistantPageOwner,
): boolean {
  return (
    left?.pageKey === right.pageKey &&
    left.generation === right.generation
  )
}

export type AssistantPageSessionValue = {
  pageKey: string
  owner: AssistantPageOwner
  pageState: AssistantPageStateV1
  ready: boolean
  hasState: boolean
  persistenceError: string | null
  registerResetHandler: (handler: () => void) => () => void
  setPageFilter: (
    owner: AssistantPageOwner,
    filter: Filter,
  ) => PageFilterWriteResult
  startNewChat: (owner: AssistantPageOwner) => boolean
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
  onIdle: () => void | Promise<void>,
): () => void {
  let active = true
  let unsubscribe = () => {}
  const finish = () => {
    if (!active || runtime.thread.getState().isRunning) return
    active = false
    unsubscribe()
    void onIdle()
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
  visualStore,
  children,
}: {
  runtime: AssistantRuntime
  epochRef?: MutableRefObject<number>
  visualStore?: VisualAttachmentStore
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
  const provisionalPageKeyRef = useRef<string | null>(null)
  const messageSnapshotRef = useRef(
    JSON.stringify(serializeMessages(runtime.thread.getState().messages)),
  )
  const clearingPageKeysRef = useRef(new Set<string>())
  const resetHandlerRef = useRef<() => void>(() => {})
  const [generation, setGeneration] = useState(activeEpochRef.current)
  const [hydratedPageKey, setHydratedPageKey] = useState<string | null>(null)
  const [pageState, setPageState] = useState(() =>
    readAssistantPageState(pageKey),
  )
  const [messageCount, setMessageCount] = useState(
    () => runtime.thread.getState().messages.length,
  )
  const [persistenceError, setPersistenceError] = useState<string | null>(null)

  const reportVisualPersistenceError = useCallback((error: unknown) => {
    setPersistenceError(
      error instanceof Error
        ? error.message
        : 'Visual attachment persistence failed.',
    )
  }, [])

  const reconcileVisualAttachments = useCallback((
    targetPageKey: string,
    messages: ReturnType<typeof serializeMessages>,
  ) => {
    if (!visualStore) return
    void visualStore.reconcilePage(
      targetPageKey,
      extractAttachmentIds(messages),
    ).catch((error: unknown) => {
      if (activeKeyRef.current === targetPageKey) {
        reportVisualPersistenceError(error)
      }
    })
  }, [reportVisualPersistenceError, visualStore])

  const saveSnapshot = useCallback((
    targetPageKey: string,
    claimProvisional = false,
    messages = serializeMessages(runtime.thread.getState().messages),
  ) => {
    if (clearingPageKeysRef.current.has(targetPageKey)) return
    if (
      provisionalPageKeyRef.current === targetPageKey &&
      !claimProvisional
    ) return
    const result = patchAssistantPageState(targetPageKey, {
      messages,
    })
    if (claimProvisional && activeKeyRef.current === targetPageKey) {
      provisionalPageKeyRef.current = null
    }
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
    if (result.ok) reconcileVisualAttachments(targetPageKey, messages)
  }, [reconcileVisualAttachments, runtime])

  const saveMessages = useCallback(() => {
    if (hydratingRef.current || runtime.thread.getState().isRunning) return
    const messages = serializeMessages(runtime.thread.getState().messages)
    const snapshot = JSON.stringify(messages)
    if (snapshot === messageSnapshotRef.current) return
    messageSnapshotRef.current = snapshot
    saveSnapshot(activeKeyRef.current, true, messages)
  }, [runtime, saveSnapshot])

  const onThreadChange = useCallback(() => {
    setMessageCount(runtime.thread.getState().messages.length)
    saveMessages()
  }, [runtime, saveMessages])

  useLayoutEffect(() => {
    activeEpochRef.current += 1
    const transitionEpoch = activeEpochRef.current
    setGeneration(transitionEpoch)
    const previousPageKey = activeKeyRef.current
    if (previousPageKey !== pageKey) saveSnapshot(previousPageKey)
    hydratingRef.current = true
    setHydratedPageKey(null)

    return cancelRunAndWaitForIdle(runtime, () => {
      if (activeEpochRef.current !== transitionEpoch) return
      const readResult = readAssistantPageStateResult(pageKey)
      let restored = readResult.state
      let restoredMessages: ReturnType<typeof restoreMessages>
      activeKeyRef.current = pageKey
      provisionalPageKeyRef.current = readResult.authoritative
        ? null
        : pageKey
      try {
        restoredMessages = restoreMessages(restored.messages)
        runtime.thread.reset(restoredMessages)
        messageSnapshotRef.current = JSON.stringify(
          serializeMessages(runtime.thread.getState().messages),
        )
        if (readResult.authoritative) setPersistenceError(null)
      } catch {
        const cleared = clearAssistantPageState(pageKey)
        restored = cleared.state
        restoredMessages = []
        runtime.thread.reset([])
        messageSnapshotRef.current = JSON.stringify(
          serializeMessages(runtime.thread.getState().messages),
        )
        provisionalPageKeyRef.current = pageKey
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
    owner: AssistantPageOwner,
    filter: Filter,
  ): PageFilterWriteResult => {
    if (
      owner.pageKey !== latestRouteKeyRef.current ||
      owner.generation !== activeEpochRef.current
    ) {
      return {
        accepted: false,
        ok: false,
        state: readAssistantPageState(owner.pageKey),
        error: STALE_PAGE_FILTER_ERROR,
      }
    }
    const result = patchAssistantPageState(owner.pageKey, { filter })
    setPageState(result.state)
    setPersistenceError(result.ok ? null : result.error)
    return { accepted: true, ...result }
  }, [activeEpochRef])

  const startNewChat = useCallback((owner: AssistantPageOwner) => {
    const activeOwner = {
      pageKey: latestRouteKeyRef.current,
      generation: activeEpochRef.current,
    }
    if (
      !isSameAssistantPageOwner(owner, activeOwner) ||
      hydratingRef.current ||
      activeKeyRef.current !== owner.pageKey
    ) return false

    activeEpochRef.current += 1
    setGeneration(activeEpochRef.current)
    const targetPageKey = latestRouteKeyRef.current
    clearingPageKeysRef.current.add(targetPageKey)
    hydratingRef.current = true
    setHydratedPageKey(null)

    cancelRunAndWaitForIdle(runtime, () => {
      const result = clearAssistantPageState(targetPageKey)
      provisionalPageKeyRef.current = targetPageKey
      const finish = (visualError: unknown = null) => {
        setPersistenceError(
          visualError
            ? visualError instanceof Error
              ? visualError.message
              : 'Visual attachment persistence failed.'
            : result.ok
              ? null
              : result.error,
        )
        const isCurrentPage = latestRouteKeyRef.current === targetPageKey
        try {
          if (isCurrentPage) {
            activeKeyRef.current = targetPageKey
            runtime.thread.reset([])
            messageSnapshotRef.current = JSON.stringify(
              serializeMessages(runtime.thread.getState().messages),
            )
            try {
              resetHandlerRef.current()
            } catch {
              // Page-owned cleanup cannot prevent the session reset from settling.
            }
          }
        } finally {
          if (isCurrentPage) {
            setMessageCount(0)
            setPageState(result.state)
            hydratingRef.current = false
            setHydratedPageKey(targetPageKey)
          }
          clearingPageKeysRef.current.delete(targetPageKey)
        }
      }

      if (!visualStore) {
        finish()
        return
      }
      return visualStore.deletePage(targetPageKey).then(
        () => finish(),
        (error: unknown) => finish(error),
      )
    })
    return true
  }, [activeEpochRef, runtime, visualStore])

  const ready = hydratedPageKey === pageKey
  const owner = useMemo<AssistantPageOwner>(() => ({
    pageKey,
    generation,
  }), [generation, pageKey])
  const value = useMemo<AssistantPageSessionValue>(() => ({
    pageKey,
    owner,
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
    owner,
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

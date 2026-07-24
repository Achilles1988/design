import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { hasValidConfig } from '@/lib/ai/config'
import { confirmTip } from '@/lib/confirmTip'
import { AssistantThread } from './AssistantThread'
import { useAssistantPageSession } from './pageSession'
import './assistant.css'

export function AssistantPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const {
    ready,
    hasState,
    persistenceError,
    startNewChat,
  } = useAssistantPageSession()

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function onNewChat() {
    if (hasState) {
      const confirmed = await confirmTip({
        message: 'Start a new chat? This clears the conversation and filters for this page.',
        confirmLabel: 'Start new chat',
        danger: false,
      })
      if (!confirmed) return
    }

    startNewChat()
    requestAnimationFrame(() => composerInputRef.current?.focus())
  }

  if (!open) return null

  const configured = hasValidConfig()
  return (
    <aside id="assistant-panel" className="assistant-panel" aria-label="AI Assistant">
      <header className="assistant-panel__header">
        <span>AI Assistant</span>
        <div className="assistant-panel__actions">
          {configured ? (
            <button
              type="button"
              className="assistant-panel__new-chat"
              onClick={onNewChat}
              aria-label="New chat"
            >
              New chat
            </button>
          ) : null}
          <button
            type="button"
            className="assistant-panel__close"
            onClick={onClose}
            aria-label="Close assistant"
            autoFocus={!configured}
          >
            ×
          </button>
        </div>
      </header>
      <div className="assistant-panel__body">
        {persistenceError ? (
          <p className="assistant-panel__persistence-warning" role="status">
            Your conversation is available for this session but could not be saved.
          </p>
        ) : null}
        {configured && !ready ? (
          <div className="assistant-panel__guidance" role="status">
            <p>Loading conversation…</p>
          </div>
        ) : configured ? (
          <AssistantThread composerInputRef={composerInputRef} />
        ) : (
          <div className="assistant-panel__guidance">
            <p>Configure an AI provider before starting a conversation.</p>
            <Link to="/settings" onClick={onClose}>Open Settings</Link>
          </div>
        )}
      </div>
    </aside>
  )
}

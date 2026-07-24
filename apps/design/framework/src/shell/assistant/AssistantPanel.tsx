import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { hasValidConfig } from '@/lib/ai/config'
import { AssistantThread } from './AssistantThread'
import './assistant.css'

export function AssistantPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const configured = hasValidConfig()
  return (
    <aside id="assistant-panel" className="assistant-panel" aria-label="AI Assistant">
      <header className="assistant-panel__header">
        <span>AI Assistant</span>
        <button
          type="button"
          className="assistant-panel__close"
          onClick={onClose}
          aria-label="Close assistant"
          autoFocus={!configured}
        >
          ×
        </button>
      </header>
      <div className="assistant-panel__body">
        {configured ? (
          <AssistantThread />
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

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { hasValidConfig } from '@/lib/ai/config'
import { AssistantThread } from './AssistantThread'
import './assistant.css'

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const configured = hasValidConfig()
  return (
    <div className="assistant-overlay" role="dialog" aria-modal="true" aria-label="AI 助手">
      <div className="assistant-overlay__scrim" onClick={onClose} />
      <aside className="assistant-panel">
        <header className="assistant-panel__header">
          <span>AI 助手</span>
          <button
            type="button"
            className="assistant-panel__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="assistant-panel__body">
          {configured ? (
            <AssistantThread />
          ) : (
            <div className="assistant-panel__guidance">
              <p>请先配置 AI provider。</p>
              <Link to="/settings">打开 Settings</Link>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

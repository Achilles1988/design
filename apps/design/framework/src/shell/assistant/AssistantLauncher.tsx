import { useAssistantAvailability } from './availability'
import './assistant.css'

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z" />
    </svg>
  )
}

export function AssistantLauncher({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { available } = useAssistantAvailability()
  if (!available) return null
  return (
    <button
      type="button"
      className={open ? 'assistant-launcher assistant-launcher--active' : 'assistant-launcher'}
      onClick={onToggle}
      aria-label={open ? 'Close assistant' : 'Open assistant'}
      aria-pressed={open}
      title="AI 助手"
    >
      <SparkIcon />
    </button>
  )
}

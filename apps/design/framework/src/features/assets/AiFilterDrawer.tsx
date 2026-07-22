import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AssetMeta } from '@/lib/ai/assetIndex'
import type { RunAssetSearchTurnInput } from '@/lib/ai/client'
import { hasValidConfig } from '@/lib/ai/config'
import { chipId, type Filter } from '@/lib/ai/filterState'
import type { Reply } from '@/lib/ai/schema'
import type { AssetKind } from '@/lib/types'
import { useAssetSearchAgent } from './useAssetSearchAgent'

type Props = {
  open: boolean
  kind: AssetKind
  index: AssetMeta[]
  filter: Filter
  onFilterChange: (next: Filter) => void
  basePrompt: string
  matchCount: number
  totalCount: number
  onClose: () => void
  sendTurn?: (input: RunAssetSearchTurnInput) => Promise<Reply>
}

export function AiFilterDrawer({
  open,
  kind,
  index,
  filter,
  onFilterChange,
  basePrompt,
  matchCount,
  totalCount,
  onClose,
  sendTurn,
}: Props) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const configured = hasValidConfig()

  const { entries, sending, ask, clear } = useAssetSearchAgent({
    kind,
    index,
    filter,
    onFilterChange,
    basePrompt,
    sendTurn,
  })

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof el.scrollTo !== 'function') return
    el.scrollTo({ top: el.scrollHeight })
  }, [entries.length, sending])

  if (!open) return null

  function onSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    void ask(text)
  }

  return (
    <div className="ai-drawer" role="dialog" aria-modal="true" aria-label="AI filter">
      <div className="ai-drawer__scrim" onClick={onClose} />
      <aside className="ai-drawer__panel">
        <header className="ai-drawer__header">
          <span className="ai-drawer__title">AI 筛选</span>
          <button
            type="button"
            className="ai-drawer__close"
            onClick={onClose}
            aria-label="Close AI filter"
          >
            ×
          </button>
        </header>

        <div className="ai-drawer__status">
          {filter.chips.length > 0
            ? `${matchCount} / ${totalCount} 匹配`
            : `${totalCount} packages`}
          {entries.length > 0 ? (
            <button
              type="button"
              className="ai-drawer__reset"
              onClick={clear}
            >
              Clear chat
            </button>
          ) : null}
        </div>

        <div className="ai-drawer__scroll" ref={scrollRef}>
          {!configured ? (
            <div className="ai-drawer__guidance">
              <p>Configure your AI provider first.</p>
              <Link to="/settings" className="assets-btn assets-btn--ghost">
                Open Settings
              </Link>
            </div>
          ) : entries.length === 0 ? (
            <p className="ai-drawer__hint">
              Describe the style / layout you want. Example: "想做金融数据看板，冷色调，深色主题"。
            </p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className={`ai-drawer__msg ai-drawer__msg--${e.role} ai-drawer__msg--${e.kind ?? 'normal'}`}
              >
                <div className="ai-drawer__msg-body">{e.content}</div>
                {e.deltaSummary ? (
                  <div className="ai-drawer__msg-delta">{e.deltaSummary}</div>
                ) : null}
              </div>
            ))
          )}
          {sending ? <p className="ai-drawer__hint">Thinking…</p> : null}
        </div>

        <footer className="ai-drawer__footer">
          <textarea
            className="ai-drawer__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="Tell me what you're looking for…"
            disabled={!configured || sending}
            rows={2}
            autoFocus
          />
          <button
            type="button"
            className="assets-btn"
            onClick={onSend}
            disabled={!configured || sending || input.trim().length === 0}
          >
            Send
          </button>
        </footer>
      </aside>
    </div>
  )
}

// re-export for callers to build chip ids consistently
export { chipId }

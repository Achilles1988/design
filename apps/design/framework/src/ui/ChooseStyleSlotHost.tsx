import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  subscribeChooseStyleSlot,
  type ChooseStyleSlotRequest,
} from '@/lib/chooseStyleSlot'
import type { StyleApplySlot } from '@/lib/types'
import './ChooseStyleSlotHost.css'

const SLOT_LABELS: Record<StyleApplySlot, string> = {
  light: 'Light',
  dark: 'Dark',
  both: 'Both',
}

export function ChooseStyleSlotHost() {
  const [active, setActive] = useState<ChooseStyleSlotRequest | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => subscribeChooseStyleSlot(setActive), [])

  useEffect(() => {
    if (!active) return
    const request = active

    const root = document.getElementById('root')
    if (root) root.inert = true

    cancelRef.current?.focus()

    function focusables(): HTMLElement[] {
      const dialog = dialogRef.current
      if (!dialog) return []
      return Array.from(dialog.querySelectorAll('button'))
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        request.resolve(null)
        return
      }

      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const current = document.activeElement
      if (event.shiftKey) {
        if (current === first || !items.includes(current as HTMLElement)) {
          event.preventDefault()
          last.focus()
        }
      } else if (current === last || !items.includes(current as HTMLElement)) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (root) root.inert = false
    }
  }, [active])

  if (!active) return null

  return createPortal(
    <div
      className="choose-style-slot"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) active.resolve(null)
      }}
    >
      <div
        ref={dialogRef}
        className="choose-style-slot__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <p className="choose-style-slot__message" id={titleId}>
          Which slot should this style install into?
        </p>
        <div className="choose-style-slot__actions">
          {active.options.map((slot) => (
            <button
              key={slot}
              type="button"
              className="choose-style-slot__btn"
              onClick={() => active.resolve(slot)}
            >
              {SLOT_LABELS[slot]}
            </button>
          ))}
          <button
            ref={cancelRef}
            type="button"
            className="choose-style-slot__btn choose-style-slot__btn--ghost"
            onClick={() => active.resolve(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

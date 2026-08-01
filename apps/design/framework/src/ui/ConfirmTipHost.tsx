import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  subscribeConfirmTip,
  type ConfirmTipRequest,
} from '@/lib/confirmTip'
import './ConfirmTipHost.css'

export function ConfirmTipHost() {
  const [active, setActive] = useState<ConfirmTipRequest | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => subscribeConfirmTip(setActive), [])

  useEffect(() => {
    if (!active) return
    const tip = active

    const root = document.getElementById('root')
    if (root) root.inert = true

    cancelRef.current?.focus()

    function focusables(): HTMLElement[] {
      return [cancelRef.current, confirmRef.current].filter(
        (el): el is HTMLButtonElement => el != null,
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        tip.resolve(false)
        return
      }

      if (event.key === 'Enter') {
        const target = event.target
        if (target instanceof HTMLButtonElement) return
        event.preventDefault()
        tip.resolve(true)
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

  const confirmLabel = active.confirmLabel ?? 'Confirm'
  const cancelLabel = active.cancelLabel ?? 'Cancel'

  return createPortal(
    <div
      className="confirm-tip"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) active.resolve(false)
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-tip__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <p className="confirm-tip__message" id={titleId}>
          {active.message}
        </p>
        <div className="confirm-tip__actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-tip__btn confirm-tip__btn--ghost"
            onClick={() => active.resolve(false)}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={
              active.danger
                ? 'confirm-tip__btn confirm-tip__btn--danger'
                : 'confirm-tip__btn'
            }
            onClick={() => active.resolve(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

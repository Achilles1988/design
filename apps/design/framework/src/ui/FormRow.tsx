import type { ReactNode } from 'react'
import './FormRow.css'

type FormRowProps = {
  label: ReactNode
  children: ReactNode
  hint?: ReactNode
  hintId?: string
  error?: ReactNode
  errorId?: string
}

export function FormRow({
  label,
  children,
  hint,
  hintId,
  error,
  errorId,
}: FormRowProps) {
  return (
    <div className="form-row">
      <div className="form-row__label">{label}</div>
      <div className="form-row__control">
        {children}
        {hint ? (
          <div id={hintId} className="form-row__hint">
            {hint}
          </div>
        ) : null}
        {error ? (
          <div id={errorId} className="form-row__error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}

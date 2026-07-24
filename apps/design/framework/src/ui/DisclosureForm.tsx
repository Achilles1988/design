import type { ReactNode } from 'react'
import './DisclosureForm.css'

type DisclosureFormProps = {
  open: boolean
  id: string
  labelledBy: string
  children: ReactNode
}

export function DisclosureForm({
  open,
  id,
  labelledBy,
  children,
}: DisclosureFormProps) {
  if (!open) return null

  return (
    <div
      id={id}
      className="disclosure-form"
      role="region"
      aria-labelledby={labelledBy}
    >
      {children}
    </div>
  )
}

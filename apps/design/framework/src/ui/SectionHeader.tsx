import type { ReactNode } from 'react'
import './SectionHeader.css'

type SectionHeaderProps = {
  title: ReactNode
  action?: ReactNode
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="section-header__title">{title}</div>
      {action ? <div className="section-header__action">{action}</div> : null}
    </div>
  )
}

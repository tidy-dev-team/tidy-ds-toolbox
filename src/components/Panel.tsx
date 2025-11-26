import React from 'react'

interface PanelProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div className={`panel ${className}`}>
      {title && <div className="panel-header">{title}</div>}
      <div className="panel-content">{children}</div>
    </div>
  )
}
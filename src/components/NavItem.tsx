import React from 'react'

interface NavItemProps {
  icon: string
  label: string
  active?: boolean
  onClick: () => void
}

export function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="icon">{icon}</span>
      <span className="label">{label}</span>
    </button>
  )
}
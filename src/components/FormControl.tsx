import React from 'react'

interface FormControlProps {
  label?: string
  error?: string
  children: React.ReactNode
  className?: string
}

export function FormControl({ label, error, children, className = '' }: FormControlProps) {
  return (
    <div className={`form-control ${className}`}>
      {label && <label className="form-label">{label}</label>}
      {children}
      {error && <div className="form-error">{error}</div>}
    </div>
  )
}
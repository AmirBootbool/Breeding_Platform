import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import './DetailDrawer.css'

export interface DetailDrawerProps {
  isOpen: boolean
  title?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  width?: string
}

export default function DetailDrawer({
  isOpen,
  title,
  onClose,
  children,
  width = 'min(480px, 90vw)',
}: DetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement
      drawerRef.current?.focus()
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isOpen && e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div
        className="drawer-backdrop fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="detail-drawer slide-left"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Detail drawer'}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div className="drawer-title">{title}</div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          {children}
        </div>
      </aside>
    </>
  )
}

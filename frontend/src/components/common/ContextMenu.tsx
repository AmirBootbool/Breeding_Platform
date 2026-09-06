import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

export interface ContextMenuProps {
  x: number
  y: number
  items: (ContextMenuItem | 'divider')[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Adjust coordinates if menu would bleed off-screen
  const adjustedX = Math.min(x, window.innerWidth - 180)
  const adjustedY = Math.min(y, window.innerHeight - 240)

  return (
    <div
      ref={menuRef}
      className="context-menu-popup"
      style={{ left: adjustedX, top: adjustedY }}
      onClick={e => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        if (item === 'divider') {
          return <div key={idx} className="context-menu-divider" />
        }
        return (
          <button
            key={idx}
            className="context-menu-item"
            style={item.danger ? { color: 'hsl(4, 80%, 70%)' } : undefined}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick()
                onClose()
              }
            }}
          >
            {item.icon && <span>{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

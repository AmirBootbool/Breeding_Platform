import { useState, useRef, useEffect } from 'react'
import { Bell, Check, Trash2 } from 'lucide-react'
import { useNotificationStore, NotificationItem } from '../../store/notificationStore'
import { useLowStockAlerts } from './useLowStockAlerts'
import { useNeedsAttentionTrials } from './useNeedsAttentionTrials'
import { useNeedsRetestAlerts } from './useNeedsRetestAlerts'
import './NotificationCenter.css'

function formatTimeAgo(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}d ago`
}

const KIND_ICONS: Record<NotificationItem['kind'], string> = {
  sync: '🔄',
  stock: '🌾',
  import: '📥',
  qc: '🛡️',
}

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Activate low stock querying & background notifications
  useLowStockAlerts()
  useNeedsAttentionTrials()
  useNeedsRetestAlerts()

  const { items, markAllRead, markRead, clearAll } = useNotificationStore()
  const unreadCount = items.filter((item) => !item.read).length

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <div className="notification-center-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="btn btn-ghost btn-sm notification-bell-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Notifications"
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="notification-badge" data-testid="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="notification-dropdown"
          role="dialog"
          aria-label="Notification center"
        >
          <div className="notification-header">
            <h3>
              Notifications
              {unreadCount > 0 && (
                <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                  {unreadCount} unread
                </span>
              )}
            </h3>
            <div className="notification-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-xs flex items-center gap-1"
                  onClick={markAllRead}
                  title="Mark all as read"
                  data-testid="mark-all-read-btn"
                >
                  <Check size={12} /> Mark read
                </button>
              )}
              {items.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-xs text-muted"
                  onClick={clearAll}
                  title="Clear all notifications"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="notification-list">
            {items.length === 0 ? (
              <div className="notification-empty">
                <div className="notification-empty-icon">🔔</div>
                <p>No new notifications</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`notification-item ${item.read ? 'read' : 'unread'}`}
                  onClick={() => markRead(item.id)}
                  data-testid={`notification-item-${item.kind}`}
                >
                  <span className="notification-item-icon">{KIND_ICONS[item.kind] || '📌'}</span>
                  <div className="notification-item-content">
                    {item.title && <div className="notification-item-title">{item.title}</div>}
                    <div className="notification-item-text">{item.text}</div>
                    <div className="notification-item-time">{formatTimeAgo(item.ts)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { syncManager, SyncStatus } from '../../services/syncManager'
import OfflineSyncCenterModal from './OfflineSyncCenterModal'

export default function OfflineSyncBadge() {
  const [status, setStatus] = useState<SyncStatus>(syncManager.getStatus())
  const [queueCount, setQueueCount] = useState<number>(syncManager.getQueueCount())
  const [showCenter, setShowCenter] = useState(false)

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((newStatus, count) => {
      setStatus(newStatus)
      setQueueCount(count)
    })
    return () => unsubscribe()
  }, [])

  return (
    <>
      <div
        id="offline-sync-badge-btn"
        onClick={() => setShowCenter(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)',
          padding: '4px 10px',
          borderRadius: '999px',
          cursor: 'pointer',
          transition: 'transform 0.15s, opacity 0.15s',
          backgroundColor:
            status === 'offline'
              ? 'rgba(245, 158, 11, 0.15)'
              : status === 'syncing'
              ? 'rgba(59, 130, 246, 0.15)'
              : queueCount > 0
              ? 'rgba(245, 158, 11, 0.15)'
              : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${
            status === 'offline'
              ? 'rgba(245, 158, 11, 0.4)'
              : status === 'syncing'
              ? 'rgba(59, 130, 246, 0.4)'
              : queueCount > 0
              ? 'rgba(245, 158, 11, 0.4)'
              : 'rgba(16, 185, 129, 0.4)'
          }`,
        }}
        title="Click to open Offline Sync & Field Package Center"
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor:
              status === 'offline'
                ? '#f59e0b'
                : status === 'syncing'
                ? '#3b82f6'
                : queueCount > 0
                ? '#f59e0b'
                : '#10b981',
            animation: status === 'syncing' ? 'pulse 1s infinite' : 'none',
          }}
        />
        <span style={{ fontWeight: 600 }}>
          {status === 'offline'
            ? `Offline (${queueCount} pending)`
            : status === 'syncing'
            ? 'Syncing…'
            : queueCount > 0
            ? `${queueCount} pending sync`
            : 'Cloud Connected'}
        </span>
      </div>

      {showCenter && <OfflineSyncCenterModal onClose={() => setShowCenter(false)} />}
    </>
  )
}

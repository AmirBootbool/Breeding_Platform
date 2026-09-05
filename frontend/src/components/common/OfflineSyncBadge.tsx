import { useState, useEffect } from 'react'
import { syncManager, SyncStatus } from '../../services/syncManager'

export default function OfflineSyncBadge() {
  const [status, setStatus] = useState<SyncStatus>(syncManager.getStatus())
  const [queueCount, setQueueCount] = useState<number>(syncManager.getQueueCount())
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((newStatus, count) => {
      setStatus(newStatus)
      setQueueCount(count)
    })
    return () => unsubscribe()
  }, [])

  const handleManualSync = async () => {
    setSyncMessage('Syncing offline records...')
    const result = await syncManager.syncNow()
    if (result.syncedCount > 0) {
      setSyncMessage(`✓ Synced ${result.syncedCount} observations!`)
      setTimeout(() => setSyncMessage(null), 3000)
    } else if (result.failedCount > 0) {
      setSyncMessage(`⚠️ ${result.failedCount} records failed to sync.`)
      setTimeout(() => setSyncMessage(null), 4000)
    } else {
      setSyncMessage('Queue is up to date.')
      setTimeout(() => setSyncMessage(null), 2000)
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-xs)',
        padding: '4px 10px',
        borderRadius: '999px',
        backgroundColor:
          status === 'offline'
            ? 'rgba(245, 158, 11, 0.15)'
            : status === 'syncing'
            ? 'rgba(59, 130, 246, 0.15)'
            : 'rgba(16, 185, 129, 0.15)',
        border: `1px solid ${
          status === 'offline'
            ? 'rgba(245, 158, 11, 0.4)'
            : status === 'syncing'
            ? 'rgba(59, 130, 246, 0.4)'
            : 'rgba(16, 185, 129, 0.4)'
        }`,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor:
            status === 'offline' ? '#f59e0b' : status === 'syncing' ? '#3b82f6' : '#10b981',
          animation: status === 'syncing' ? 'pulse 1s infinite' : 'none',
        }}
      />
      <span style={{ fontWeight: 600 }}>
        {status === 'offline'
          ? `Offline (${queueCount} pending)`
          : status === 'syncing'
          ? 'Syncing...'
          : queueCount > 0
          ? `${queueCount} pending sync`
          : 'Cloud Connected'}
      </span>

      {queueCount > 0 && status !== 'syncing' && (
        <button
          onClick={handleManualSync}
          className="btn btn-secondary btn-sm"
          style={{
            padding: '1px 6px',
            fontSize: '10px',
            height: '20px',
            marginLeft: '4px',
          }}
        >
          Sync Now
        </button>
      )}

      {syncMessage && (
        <span style={{ color: 'var(--color-primary)', fontWeight: 600, marginLeft: 4 }}>
          {syncMessage}
        </span>
      )}
    </div>
  )
}

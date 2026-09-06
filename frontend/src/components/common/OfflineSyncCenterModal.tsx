import { useState, useEffect } from 'react'
import { syncManager, SyncStatus } from '../../services/syncManager'
import { offlineStorage, QueuedObservation } from '../../services/offlineStorage'
import { OfflineTrialPackage } from '../../services/offlineDb'
import Modal from '../Modal'

interface OfflineSyncCenterModalProps {
  onClose: () => void
}

export default function OfflineSyncCenterModal({ onClose }: OfflineSyncCenterModalProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'cached_trials'>('queue')
  const [status, setStatus] = useState<SyncStatus>(syncManager.getStatus())
  const [queue, setQueue] = useState<QueuedObservation[]>(offlineStorage.getQueuedObservations())
  const [cachedTrials, setCachedTrials] = useState<OfflineTrialPackage[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    const unsub = syncManager.subscribe((newStatus) => {
      setStatus(newStatus)
      setQueue(offlineStorage.getQueuedObservations())
    })

    offlineStorage.listCachedTrials().then(setCachedTrials)

    return () => unsub()
  }, [])

  const handleSyncNow = async () => {
    setSyncing(true)
    setSyncMessage('Synchronizing records with central server…')
    const res = await syncManager.syncNow()
    setSyncing(false)
    setQueue(offlineStorage.getQueuedObservations())

    if (res.syncedCount > 0) {
      setSyncMessage(`✓ Successfully pushed ${res.syncedCount} observations to server!`)
    } else if (res.failedCount > 0) {
      setSyncMessage(`⚠️ ${res.failedCount} records failed. Verify server connection.`)
    } else {
      setSyncMessage('All offline observations are up to date.')
    }
  }

  const handleDeleteQueued = (clientId: string) => {
    offlineStorage.removeQueuedObservation(clientId)
    setQueue(offlineStorage.getQueuedObservations())
  }

  const handleClearAllQueued = () => {
    if (confirm('Clear all pending offline observations? Any unsynced data will be permanently discarded.')) {
      offlineStorage.clearQueuedObservations()
      setQueue([])
    }
  }

  const handleDeleteCachedTrial = async (trialId: number) => {
    await offlineStorage.removeCachedTrial(trialId)
    const updated = await offlineStorage.listCachedTrials()
    setCachedTrials(updated)
  }

  return (
    <Modal title="Offline Sync & Field Package Center" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Status header bar */}
        <div
          className="card"
          style={{
            padding: 'var(--space-3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: status === 'offline' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            borderColor: status === 'offline' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: status === 'offline' ? '#f59e0b' : status === 'syncing' ? '#3b82f6' : '#10b981',
              }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                {status === 'offline' ? 'Offline Field Mode' : status === 'syncing' ? 'Sync in Progress…' : 'Cloud Connected'}
              </div>
              <div className="text-xs text-muted">
                {status === 'offline' ? 'Changes saved locally to IndexedDB/Storage' : 'Connected to central breeding database'}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {queue.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => syncManager.exportQueueToCsv()}>
                📥 Backup CSV
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              disabled={syncing || status === 'offline' || queue.length === 0}
              onClick={handleSyncNow}
            >
              {syncing ? 'Syncing…' : `Push ${queue.length} Records`}
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="alert alert-info">
            <span>ℹ️</span><span>{syncMessage}</span>
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'queue' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('queue')}
          >
            📋 Pending Observations ({queue.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'cached_trials' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('cached_trials')}
          >
            📦 Downloaded Field Trials ({cachedTrials.length})
          </button>
        </div>

        {/* Tab 1: Queue Table */}
        {activeTab === 'queue' && (
          <div>
            {queue.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                <div className="empty-icon">✓</div>
                <p>All observation records have been synchronized with the cloud.</p>
              </div>
            ) : (
              <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Plot</th>
                      <th>Trait / Variable</th>
                      <th>Value</th>
                      <th>Recorded Time</th>
                      <th style={{ width: 60 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((item) => (
                      <tr key={item.clientId}>
                        <td><strong>Plot #{item.plotNumber || item.plot}</strong></td>
                        <td>{item.variable_name || `Trait #${item.variable}`}</td>
                        <td className="font-mono font-semibold" style={{ color: 'var(--brand-300)' }}>
                          {item.value_numeric ?? item.value_text ?? item.value_date ?? '—'}
                        </td>
                        <td className="text-xs text-muted">{new Date(item.recordedAt).toLocaleTimeString()}</td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Discard record"
                            style={{ color: 'var(--status-danger)' }}
                            onClick={() => handleDeleteQueued(item.clientId)}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {queue.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--status-danger)' }}
                  onClick={handleClearAllQueued}
                >
                  Discard All Pending Records
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Cached Trials */}
        {activeTab === 'cached_trials' && (
          <div>
            {cachedTrials.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                <div className="empty-icon">📦</div>
                <p>No trials downloaded for offline work yet. Open any Trial and click "Make Available Offline".</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
                {cachedTrials.map((t) => (
                  <div key={t.trialId} className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{t.trialCode}</div>
                        <div className="text-xs text-muted">{t.name}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Delete cached package"
                        style={{ color: 'var(--status-danger)' }}
                        onClick={() => handleDeleteCachedTrial(t.trialId)}
                      >
                        🗑
                      </button>
                    </div>
                    <div className="flex gap-2 text-xs" style={{ marginTop: 4 }}>
                      <span className="badge badge-gray">{t.plots?.length || 0} plots</span>
                      <span className="badge badge-blue">{t.variables?.length || 0} traits</span>
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                      Downloaded: {new Date(t.downloadedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 'var(--space-2)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}

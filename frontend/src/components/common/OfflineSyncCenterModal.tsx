import { useState, useEffect } from 'react'
import { syncManager, SyncStatus, SyncConflict } from '../../services/syncManager'
import { offlineStorage, QueuedObservation } from '../../services/offlineStorage'
import { OfflineTrialPackage } from '../../services/offlineDb'
import Modal from '../Modal'
import { AlertTriangle, CheckCircle, Server, Smartphone, Trash2 } from 'lucide-react'

interface OfflineSyncCenterModalProps {
  onClose: () => void
}

export default function OfflineSyncCenterModal({ onClose }: OfflineSyncCenterModalProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'conflicts' | 'cached_trials'>('queue')
  const [status, setStatus] = useState<SyncStatus>(syncManager.getStatus())
  const [queue, setQueue] = useState<QueuedObservation[]>(offlineStorage.getQueuedObservations())
  const [conflicts, setConflicts] = useState<SyncConflict[]>(syncManager.getConflicts())
  const [cachedTrials, setCachedTrials] = useState<OfflineTrialPackage[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    const unsub = syncManager.subscribe((newStatus) => {
      setStatus(newStatus)
      setQueue(offlineStorage.getQueuedObservations())
      setConflicts(syncManager.getConflicts())
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
    setConflicts(syncManager.getConflicts())

    if (res.syncedCount > 0) {
      setSyncMessage(`✓ Successfully pushed ${res.syncedCount} observations to server!`)
    } else if (res.failedCount > 0) {
      setSyncMessage(`⚠️ ${res.failedCount} records failed. Verify server connection.`)
    } else {
      setSyncMessage('All offline observations are up to date.')
    }
  }

  const handleDeleteQueued = async (clientId: string) => {
    await offlineStorage.removeQueuedObservation(clientId)
    setQueue(offlineStorage.getQueuedObservations())
  }

  const handleClearAllQueued = async () => {
    if (confirm('Clear all pending offline observations? Any unsynced data will be permanently discarded.')) {
      await offlineStorage.clearQueuedObservations()
      setQueue([])
    }
  }

  const handleDeleteCachedTrial = async (trialId: number) => {
    await offlineStorage.removeCachedTrial(trialId)
    const updated = await offlineStorage.listCachedTrials()
    setCachedTrials(updated)
  }

  const handleResolveConflict = async (conflictId: string, resolution: 'local' | 'server') => {
    await syncManager.resolveConflict(conflictId, resolution)
    setConflicts(syncManager.getConflicts())
    setQueue(offlineStorage.getQueuedObservations())
  }

  const handleResolveAll = async (resolution: 'local' | 'server') => {
    await syncManager.resolveAllConflicts(resolution)
    setConflicts(syncManager.getConflicts())
    setQueue(offlineStorage.getQueuedObservations())
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
            id="sync-tab-queue"
            className={`btn btn-sm ${activeTab === 'queue' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('queue')}
          >
            📋 Pending Observations ({queue.length})
          </button>
          <button
            id="sync-tab-conflicts"
            className={`btn btn-sm ${activeTab === 'conflicts' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('conflicts')}
          >
            ⚡ Conflicts ({conflicts.length})
          </button>
          <button
            id="sync-tab-cached-trials"
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
                            <Trash2 size={14} />
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

        {/* Tab 2: Conflict Resolution UI (Phase 31.3) */}
        {activeTab === 'conflicts' && (
          <div className="conflicts-container">
            {conflicts.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                <CheckCircle size={36} className="text-muted mb-2 mx-auto" />
                <p>No sync conflicts detected. All offline and cloud versions are in harmony.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div className="flex justify-between items-center bg-hover p-2 rounded">
                  <span className="text-xs font-semibold text-muted">
                    {conflicts.length} Concurrent Change Conflict{conflicts.length === 1 ? '' : 's'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      id="resolve-all-local-btn"
                      className="btn btn-secondary btn-sm text-xs"
                      onClick={() => handleResolveAll('local')}
                    >
                      Keep All Local
                    </button>
                    <button
                      id="resolve-all-server-btn"
                      className="btn btn-secondary btn-sm text-xs"
                      onClick={() => handleResolveAll('server')}
                    >
                      Keep All Server
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {conflicts.map(conflict => (
                    <div
                      key={conflict.id}
                      className="card conflict-card"
                      style={{
                        padding: 'var(--space-3)',
                        border: '1px solid var(--status-warning)',
                        background: 'var(--bg-elevated)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={15} style={{ color: 'var(--status-warning)' }} />
                          <span className="font-semibold text-sm">
                            Plot #{conflict.plotNumber} · {conflict.traitName}
                          </span>
                        </div>
                        <span className="badge badge-amber text-xs">Conflict</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }} className="mb-3">
                        {/* Local Version */}
                        <div
                          style={{
                            padding: 'var(--space-2)',
                            borderRadius: 'var(--r-sm)',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div className="flex items-center gap-1 text-xs text-muted mb-1">
                            <Smartphone size={12} />
                            <span className="font-semibold">Local (Device Draft)</span>
                          </div>
                          <div className="font-mono font-bold text-sm text-brand">{conflict.localValue}</div>
                          <div className="text-xs text-muted" style={{ fontSize: '0.7rem' }}>
                            {new Date(conflict.localTimestamp).toLocaleTimeString()}
                          </div>
                          <button
                            id={`keep-local-${conflict.id}`}
                            className="btn btn-primary btn-sm w-full mt-2 text-xs"
                            onClick={() => handleResolveConflict(conflict.id, 'local')}
                          >
                            Keep Local
                          </button>
                        </div>

                        {/* Server Version */}
                        <div
                          style={{
                            padding: 'var(--space-2)',
                            borderRadius: 'var(--r-sm)',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div className="flex items-center gap-1 text-xs text-muted mb-1">
                            <Server size={12} />
                            <span className="font-semibold">Server (Cloud Record)</span>
                          </div>
                          <div className="font-mono font-bold text-sm">{conflict.serverValue}</div>
                          <div className="text-xs text-muted" style={{ fontSize: '0.7rem' }}>
                            {new Date(conflict.serverTimestamp).toLocaleTimeString()}
                          </div>
                          <button
                            id={`keep-server-${conflict.id}`}
                            className="btn btn-secondary btn-sm w-full mt-2 text-xs"
                            onClick={() => handleResolveConflict(conflict.id, 'server')}
                          >
                            Keep Server
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Cached Trials */}
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
                    <div style={{ display: 'flex', justifySelf: 'space-between', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                        <Trash2 size={14} />
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

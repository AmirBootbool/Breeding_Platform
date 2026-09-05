import { useState, useEffect } from 'react'
import { audit, AuditLogEntry } from '../../api/client'

interface EntityHistoryModalProps {
  model: string
  entityId: number
  entityName?: string
  isOpen: boolean
  onClose: () => void
}

export default function EntityHistoryModal({
  model,
  entityId,
  entityName,
  isOpen,
  onClose,
}: EntityHistoryModalProps) {
  const [history, setHistory] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !entityId) return
    setLoading(true)
    setError(null)
    audit.getEntityHistory(model, entityId)
      .then(res => {
        setHistory(res)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load entity audit trail.')
        setLoading(false)
      })
  }, [isOpen, model, entityId])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        className="modal-content"
        style={{
          width: '90vw',
          maxWidth: '650px',
          padding: 'var(--space-6)',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>🛡️ Audit History</span>
              <span className="badge badge-primary">{model} #{entityId}</span>
            </h3>
            {entityName && <p className="text-sm text-secondary" style={{ margin: '4px 0 0' }}>{entityName}</p>}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <div className="spinner" /> Loading audit history...
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && history.length === 0 && (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No recorded modifications found for this entity.
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '60vh', overflowY: 'auto' }}>
            {history.map((entry, idx) => (
              <div
                key={idx}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  backgroundColor: 'var(--color-surface-hover)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                  <span className="badge badge-outline" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                    {entry.action || 'State'}
                  </span>
                  <span className="text-xs text-secondary">
                    {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div style={{ fontWeight: 600, margin: '4px 0' }}>{entry.label}</div>
                <div className="text-xs text-secondary" style={{ display: 'flex', gap: 'var(--space-4)' }}>
                  <span>Created by: <strong>{entry.created_by || 'system'}</strong></span>
                  <span>Modified by: <strong>{entry.updated_by || entry.created_by || 'system'}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

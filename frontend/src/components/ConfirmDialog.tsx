import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  confirmLabel?: string
  title?: string
}

export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading = false,
  confirmLabel = 'Delete',
  title = 'Confirm action',
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="flex items-center gap-3 mb-4">
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            padding: 8,
            borderRadius: 'var(--r-md)',
            color: 'var(--status-danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertTriangle size={22} />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
          {message}
        </p>
      </div>
      <div className="modal-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          id="confirm-delete-btn"
          type="button"
          className="btn btn-danger"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14 }} /> Processing…
            </>
          ) : (
            confirmLabel
          )}
        </button>
      </div>
    </Modal>
  )
}

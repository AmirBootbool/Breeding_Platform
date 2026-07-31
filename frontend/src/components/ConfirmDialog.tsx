import Modal from './Modal'

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  confirmLabel?: string
}

export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading = false,
  confirmLabel = 'Delete',
}: ConfirmDialogProps) {
  return (
    <Modal title="Confirm deletion" onClose={onCancel}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7 }}>
        {message}
      </p>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button
          id="confirm-delete-btn"
          className="btn btn-danger"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Deleting…</> : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

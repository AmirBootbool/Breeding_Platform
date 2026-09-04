import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { observationVariables, ObservationVariable, ApiError } from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

const DATA_TYPES = {
  numeric: 'Numeric (Continuous)',
  integer: 'Integer (Discrete)',
  categorical: 'Categorical',
  text: 'Text',
  date: 'Date',
} as const

interface TraitModalProps {
  variable?: ObservationVariable | null
  onClose: () => void
  onSuccess: () => void
}

function TraitModal({ variable, onClose, onSuccess }: TraitModalProps) {
  const [formData, setFormData] = useState({
    name: variable?.name ?? '',
    variable_code: variable?.variable_code ?? '',
    data_type: variable?.data_type ?? 'numeric',
    unit: variable?.unit ?? '',
    min_value: variable?.min_value?.toString() ?? '',
    max_value: variable?.max_value?.toString() ?? '',
    description: variable?.description ?? '',
    is_required: variable?.is_required ?? false,
  })

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const payload: Partial<ObservationVariable> = {
      name: formData.name.trim(),
      variable_code: formData.variable_code.trim(),
      data_type: formData.data_type,
      unit: formData.unit.trim(),
      description: formData.description.trim(),
      is_required: formData.is_required,
      min_value: formData.min_value !== '' ? Number(formData.min_value) : null,
      max_value: formData.max_value !== '' ? Number(formData.max_value) : null,
    }

    try {
      if (variable) {
        await observationVariables.update(variable.id, payload)
      } else {
        await observationVariables.create(payload)
      }
      onSuccess()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(JSON.stringify(err.detail))
      } else {
        setError((err as Error).message || 'Failed to save observation variable')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isNumeric = formData.data_type === 'numeric' || formData.data_type === 'integer'

  return (
    <form onSubmit={handleSubmit} className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {error && <div className="alert alert-error"><span>⚠</span><span>{error}</span></div>}

      <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
        <div>
          <label className="form-label">Trait / Variable Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input
            id="trait-name"
            type="text"
            className="form-input"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Plant height"
          />
        </div>

        <div>
          <label className="form-label">Variable Code (Abbr)</label>
          <input
            id="trait-code"
            type="text"
            className="form-input"
            value={formData.variable_code}
            onChange={e => setFormData({ ...formData, variable_code: e.target.value })}
            placeholder="e.g., PH, GY, HD"
          />
        </div>
      </div>

      <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
        <div>
          <label className="form-label">Data Type <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select
            id="trait-data-type"
            className="form-input"
            required
            value={formData.data_type}
            onChange={e => setFormData({ ...formData, data_type: e.target.value })}
          >
            {Object.entries(DATA_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">Unit of Measure</label>
          <input
            id="trait-unit"
            type="text"
            className="form-input"
            value={formData.unit}
            onChange={e => setFormData({ ...formData, unit: e.target.value })}
            placeholder="e.g., cm, t/ha, g, %"
          />
        </div>
      </div>

      {isNumeric && (
        <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
          <div>
            <label className="form-label">Min Allowed Value</label>
            <input
              id="trait-min-val"
              type="number"
              step="any"
              className="form-input"
              value={formData.min_value}
              onChange={e => setFormData({ ...formData, min_value: e.target.value })}
              placeholder="Optional lower bound"
            />
          </div>
          <div>
            <label className="form-label">Max Allowed Value</label>
            <input
              id="trait-max-val"
              type="number"
              step="any"
              className="form-input"
              value={formData.max_value}
              onChange={e => setFormData({ ...formData, max_value: e.target.value })}
              placeholder="Optional upper bound"
            />
          </div>
        </div>
      )}

      <div>
        <label className="form-label">Description & Protocol Notes</label>
        <textarea
          id="trait-desc"
          className="form-input"
          rows={2}
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          placeholder="Measurement protocol, scale definitions, or timing notes…"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={formData.is_required}
            onChange={e => setFormData({ ...formData, is_required: e.target.checked })}
          />
          <span><strong>Required for Trials</strong> (Prompts breeders during trial setup)</span>
        </label>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
        <button id="trait-save-btn" type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (variable ? 'Save Changes' : 'Create Trait')}
        </button>
      </div>
    </form>
  )
}

export default function Traits() {
  const qc = useQueryClient()
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [showModal, setShowModal] = useState(false)
  const [editVariable, setEditVariable] = useState<ObservationVariable | null>(null)
  const [deleteVariable, setDeleteVariable] = useState<ObservationVariable | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['observation-variables'],
    queryFn: () => observationVariables.list(),
  })

  const handleEdit = (v: ObservationVariable) => {
    setEditVariable(v)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditVariable(null)
  }

  const handleDelete = async () => {
    if (!deleteVariable) return
    try {
      await observationVariables.destroy(deleteVariable.id)
      qc.invalidateQueries({ queryKey: ['observation-variables'] })
      setDeleteVariable(null)
    } catch (e: unknown) {
      alert((e as Error).message || 'Failed to delete trait variable')
    }
  }

  return (
    <div className="page-shell">
      <TopBar
        title="Trait & Variable Repository"
        subtitle={`${data?.count ?? '…'} standardized variables`}
        actions={
          canWrite ? (
            <button id="new-trait-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
              + Add New Trait
            </button>
          ) : undefined
        }
      />

      <main className="content">
        <div className="table-container">
          {isLoading ? (
            <div className="loading-spinner"><div className="spinner" /> Loading traits…</div>
          ) : data?.results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <p>No observation variables defined yet.</p>
              {canWrite && (
                <button className="btn btn-secondary mt-4" onClick={() => setShowModal(true)}>
                  Create the first trait
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Code</th>
                  <th>Trait Name</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th>Allowed Range</th>
                  <th>Description</th>
                  {canWrite && <th style={{ width: 120 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data?.results.map(v => (
                  <tr key={v.id}>
                    <td>
                      {v.variable_code ? (
                        <code className="font-mono text-sm" style={{ color: 'var(--brand-300)' }}>
                          {v.variable_code}
                        </code>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td><strong>{v.name}</strong></td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                        {DATA_TYPES[v.data_type as keyof typeof DATA_TYPES] || v.data_type}
                      </span>
                    </td>
                    <td>{v.unit || <span className="text-muted text-xs">—</span>}</td>
                    <td>
                      {v.min_value !== null && v.max_value !== null
                        ? `${v.min_value} – ${v.max_value}`
                        : v.min_value !== null
                        ? `≥ ${v.min_value}`
                        : v.max_value !== null
                        ? `≤ ${v.max_value}`
                        : <span className="text-muted text-xs">Unbounded</span>}
                    </td>
                    <td className="text-sm text-muted" style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.description || '—'}
                    </td>
                    {canWrite && (
                      <td>
                        <div className="flex gap-2">
                          <button
                            id={`edit-trait-${v.id}`}
                            className="btn btn-ghost btn-sm"
                            title="Edit"
                            onClick={() => handleEdit(v)}
                          >
                            ✏
                          </button>
                          <button
                            id={`delete-trait-${v.id}`}
                            className="btn btn-ghost btn-sm"
                            title="Delete"
                            style={{ color: 'var(--status-danger)' }}
                            onClick={() => setDeleteVariable(v)}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showModal && (
        <Modal
          title={editVariable ? `Edit Trait — ${editVariable.name}` : 'Add New Trait Variable'}
          onClose={handleCloseModal}
          wide
        >
          <TraitModal
            variable={editVariable}
            onClose={handleCloseModal}
            onSuccess={() => {
              handleCloseModal()
              qc.invalidateQueries({ queryKey: ['observation-variables'] })
            }}
          />
        </Modal>
      )}

      {deleteVariable && (
        <ConfirmDialog
          message={`Delete trait variable "${deleteVariable.name}"? If plots have observations for this variable, deletion will be protected.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteVariable(null)}
          confirmLabel="Delete Variable"
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { observationVariables, ObservationVariable, ApiError, CROP_CHOICES } from '../api/client'
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
    crop: variable?.crop ?? 'all',
    category: variable?.category ?? 'other',
    unit: variable?.unit ?? '',
    min_value: variable?.min_value?.toString() ?? '',
    max_value: variable?.max_value?.toString() ?? '',
    description: variable?.description ?? '',
    is_required: variable?.is_required ?? false,
    categorical_options: (variable?.categorical_options ?? []).join(', '),
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
      crop: formData.crop,
      category: formData.category,
      unit: formData.unit.trim(),
      description: formData.description.trim(),
      is_required: formData.is_required,
      min_value: formData.min_value !== '' ? Number(formData.min_value) : null,
      max_value: formData.max_value !== '' ? Number(formData.max_value) : null,
      categorical_options: formData.data_type === 'categorical'
        ? formData.categorical_options.split(',').map(s => s.trim()).filter(Boolean)
        : [],
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
          <label className="form-label">Crop Scope</label>
          <select id="trait-crop" className="form-input" value={formData.crop} onChange={e => setFormData({ ...formData, crop: e.target.value })}>
            <option value="all">Universal (All Crops)</option>
            {CROP_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
        <div>
          <label className="form-label">Category</label>
          <select id="trait-category" className="form-input" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
            <option value="morphological">Morphological</option>
            <option value="agronomic">Agronomic</option>
            <option value="disease">Disease Resistance</option>
            <option value="quality">Grain Quality</option>
            <option value="phenology">Phenology</option>
            <option value="abiotic">Abiotic Stress</option>
            <option value="other">Other</option>
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
        <div>
          <label className="form-label">Allowed Range (Min – Max)</label>
          <div className="flex gap-2">
            <input id="trait-min-val" type="number" step="any" className="form-input" value={formData.min_value} onChange={e => setFormData({ ...formData, min_value: e.target.value })} placeholder="Min" />
            <input id="trait-max-val" type="number" step="any" className="form-input" value={formData.max_value} onChange={e => setFormData({ ...formData, max_value: e.target.value })} placeholder="Max" />
          </div>
        </div>
      )}

      {formData.data_type === 'categorical' && (
        <div>
          <label className="form-label">Valid Categories (comma-separated)</label>
          <input
            id="trait-categorical-options"
            type="text"
            className="form-input"
            value={formData.categorical_options}
            onChange={e => setFormData({ ...formData, categorical_options: e.target.value })}
            placeholder="e.g., 1, 2, 3, 4, 5 or Resistant, Susceptible, Tolerant"
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Leave blank to allow any text. Separate options with commas.
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

  const [selectedCrop, setSelectedCrop]         = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showModal, setShowModal]               = useState(false)
  const [editVariable, setEditVariable]         = useState<ObservationVariable | null>(null)
  const [deleteVariable, setDeleteVariable]     = useState<ObservationVariable | null>(null)

  const filterParams = [
    selectedCrop && selectedCrop !== 'all' ? `&crop=${selectedCrop}` : '',
    selectedCategory ? `&category=${selectedCategory}` : '',
  ].join('')

  const { data, isLoading } = useQuery({
    queryKey: ['observation-variables', filterParams],
    queryFn: () => observationVariables.list(filterParams),
  })

  const variableList = data?.results ?? []

  const handleEdit = (v: ObservationVariable) => { setEditVariable(v); setShowModal(true) }
  const handleCloseModal = () => { setShowModal(false); setEditVariable(null) }

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

      {/* Toolbar with filters */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted">Crop:</span>
          <select id="crop-scope-filter" className="form-input" style={{ width: 200 }}
            value={selectedCrop} onChange={e => setSelectedCrop(e.target.value)}>
            <option value="all">All Crops</option>
            {CROP_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted">Category:</span>
          <select id="category-filter" className="form-input" style={{ width: 180 }}
            value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
            <option value="">All categories</option>
            <option value="morphological">Morphological</option>
            <option value="agronomic">Agronomic</option>
            <option value="disease">Disease Resistance</option>
            <option value="quality">Grain Quality</option>
            <option value="phenology">Phenology</option>
            <option value="abiotic">Abiotic Stress</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <main className="content">
        <div className="table-container">
          {isLoading ? (
            <div className="loading-spinner"><div className="spinner" /> Loading traits…</div>
          ) : variableList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <p>No observation variables defined for selected crop scope.</p>
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
                  <th style={{ width: 90 }}>Code</th>
                  <th>Trait Name</th>
                  <th>Category</th>
                  <th>Crop</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th>Range</th>
                  <th>Usage</th>
                  {canWrite && <th style={{ width: 100 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {variableList.map(v => (
                  <tr key={v.id}>
                    <td>
                      {v.variable_code
                        ? <code className="font-mono text-sm" style={{ color: 'var(--brand-300)' }}>{v.variable_code}</code>
                        : <span className="text-muted text-xs">—</span>}
                    </td>
                    <td>
                      <strong>{v.name}</strong>
                      {v.description && <div className="text-xs text-muted" style={{ marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.description}</div>}
                    </td>
                    <td><span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>{v.category || 'other'}</span></td>
                    <td><span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>{v.crop && v.crop !== 'all' ? v.crop : 'Universal'}</span></td>
                    <td><span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>{DATA_TYPES[v.data_type as keyof typeof DATA_TYPES] || v.data_type}</span></td>
                    <td>{v.unit || <span className="text-muted text-xs">—</span>}</td>
                    <td className="font-mono text-sm">
                      {v.data_type === 'categorical' && v.categorical_options?.length
                        ? v.categorical_options.slice(0, 4).join(', ') + (v.categorical_options.length > 4 ? '…' : '')
                        : v.min_value != null && v.max_value != null ? `${v.min_value}–${v.max_value}`
                        : v.min_value != null ? `≥${v.min_value}`
                        : v.max_value != null ? `≤${v.max_value}`
                        : <span className="text-muted text-xs">—</span>}
                    </td>
                    <td className="text-sm">
                      <span style={{ color: (v.usage_count ?? 0) > 0 ? 'var(--brand-300)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {v.usage_count ?? 0}
                      </span>
                      <span className="text-muted text-xs" style={{ marginLeft: 3 }}>obs</span>
                    </td>
                    {canWrite && (
                      <td>
                        <div className="flex gap-2">
                          <button id={`edit-trait-${v.id}`} className="btn btn-ghost btn-sm" title="Edit" onClick={() => handleEdit(v)}>✏</button>
                          <button id={`delete-trait-${v.id}`} className="btn btn-ghost btn-sm" title="Delete" style={{ color: 'var(--status-danger)' }} onClick={() => setDeleteVariable(v)}>🗑</button>
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

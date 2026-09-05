import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  observationVariables, traitPanels,
  ObservationVariable, TraitPanel, ApiError, CROP_CHOICES
} from '../api/client'
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
            placeholder="e.g., Resistant, Moderate, Susceptible"
          />
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

// ---- Trait Panel Modal ------------------------------------------------------
function TraitPanelModal({
  panel,
  allVariables,
  onClose,
  onSuccess,
}: {
  panel?: TraitPanel | null
  allVariables: ObservationVariable[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(panel?.name ?? '')
  const [description, setDescription] = useState(panel?.description ?? '')
  const [selectedVarIds, setSelectedVarIds] = useState<number[]>(panel?.variable_ids ?? [])
  const [error, setError] = useState('')

  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Partial<TraitPanel> & { variable_ids: number[] } = {
        name: name.trim(),
        description: description.trim(),
        variable_ids: selectedVarIds,
      }
      return panel?.id
        ? traitPanels.update(panel.id, payload)
        : traitPanels.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trait-panels'] })
      onSuccess()
    },
    onError: (err) => {
      if (err instanceof ApiError) setError(JSON.stringify(err.detail))
      else setError((err as Error).message)
    },
  })

  const toggleVar = (id: number) => {
    setSelectedVarIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div>
      {error && <div className="alert alert-error mb-4"><span>⚠</span><span>{error}</span></div>}

      <div className="form-group mb-4">
        <label className="form-label">Panel Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
        <input
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Standard Yield & Agronomy Panel"
          required
        />
      </div>

      <div className="form-group mb-4">
        <label className="form-label">Description</label>
        <input
          className="form-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Standard 5 core traits for late-stage multi-location yield trials"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Select Traits ({selectedVarIds.length} selected)</label>
        <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
          {allVariables.map(v => (
            <label
              key={v.id}
              className="hover-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                padding: '6px 8px', borderRadius: '4px', cursor: 'pointer',
                background: selectedVarIds.includes(v.id) ? 'rgba(74, 222, 128, 0.08)' : 'transparent'
              }}
            >
              <input
                type="checkbox"
                checked={selectedVarIds.includes(v.id)}
                onChange={() => toggleVar(v.id)}
              />
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{v.name}</span>
              {v.variable_code && <code className="font-mono text-xs text-muted">({v.variable_code})</code>}
              <span className="badge badge-gray" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>{v.category}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !name.trim()}
        >
          {mutation.isPending ? 'Saving…' : panel ? 'Save Changes' : 'Create Panel'}
        </button>
      </div>
    </div>
  )
}

// ---- Main Page --------------------------------------------------------------
export default function Traits() {
  const qc = useQueryClient()
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [activeTab, setActiveTab]               = useState<'traits' | 'panels' | 'formulas'>('traits')
  const [selectedCrop, setSelectedCrop]         = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showModal, setShowModal]               = useState(false)
  const [editVariable, setEditVariable]         = useState<ObservationVariable | null>(null)
  const [deleteVariable, setDeleteVariable]     = useState<ObservationVariable | null>(null)

  // Panel modals
  const [showPanelModal, setShowPanelModal]     = useState(false)
  const [editPanel, setEditPanel]               = useState<TraitPanel | null>(null)
  const [deletePanel, setDeletePanel]           = useState<TraitPanel | null>(null)

  const filterParams = [
    selectedCrop && selectedCrop !== 'all' ? `&crop=${selectedCrop}` : '',
    selectedCategory ? `&category=${selectedCategory}` : '',
  ].join('')

  const { data, isLoading } = useQuery({
    queryKey: ['observation-variables', filterParams],
    queryFn: () => observationVariables.list(filterParams),
  })

  const { data: panelsData, isLoading: panelsLoading } = useQuery({
    queryKey: ['trait-panels'],
    queryFn: () => traitPanels.list(),
  })

  const variableList = data?.results ?? []
  const panelList = panelsData?.results ?? []

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

  const handleDeletePanel = async () => {
    if (!deletePanel) return
    try {
      await traitPanels.destroy(deletePanel.id)
      qc.invalidateQueries({ queryKey: ['trait-panels'] })
      setDeletePanel(null)
    } catch (e: unknown) {
      alert((e as Error).message || 'Failed to delete panel')
    }
  }

  return (
    <div className="page-shell">
      <TopBar
        title="Trait Repository & Preset Panels"
        subtitle={`${data?.count ?? 0} standardized variables · ${panelList.length} preset scoring panels`}
        actions={
          canWrite ? (
            <div className="flex gap-2">
              {activeTab === 'panels' ? (
                <button id="new-panel-btn" className="btn btn-primary" onClick={() => { setEditPanel(null); setShowPanelModal(true) }}>
                  + Create Trait Panel
                </button>
              ) : (
                <button id="new-trait-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
                  + Add New Trait
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      {/* Top Tab Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          className={`btn btn-sm ${activeTab === 'traits' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('traits')}
        >
          🏷️ Observation Traits ({variableList.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'panels' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('panels')}
        >
          📦 Trait Preset Panels ({panelList.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'formulas' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('formulas')}
        >
          ➗ Derived Formulas
        </button>
      </div>

      {/* Tab 1: Traits list */}
      {activeTab === 'traits' && (
        <>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted">Crop:</span>
              <select id="crop-scope-filter" className="form-input" style={{ width: 180 }}
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
                  <p>No observation variables defined for selected filter.</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Code</th>
                      <th>Trait Name</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Unit</th>
                      <th>Range / Options</th>
                      <th>Usage</th>
                      {canWrite && <th style={{ width: 90 }}>Actions</th>}
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
                          {v.description && <div className="text-xs text-muted" style={{ marginTop: 2 }}>{v.description}</div>}
                        </td>
                        <td><span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>{v.category || 'other'}</span></td>
                        <td><span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>{DATA_TYPES[v.data_type as keyof typeof DATA_TYPES] || v.data_type}</span></td>
                        <td>{v.unit || <span className="text-muted text-xs">—</span>}</td>
                        <td className="font-mono text-xs">
                          {v.data_type === 'categorical' && v.categorical_options?.length
                            ? v.categorical_options.slice(0, 3).join(', ') + (v.categorical_options.length > 3 ? '…' : '')
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
                            <div className="flex gap-1">
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
        </>
      )}

      {/* Tab 2: Trait Preset Panels */}
      {activeTab === 'panels' && (
        <main className="content">
          {panelsLoading ? (
            <div className="loading-spinner"><div className="spinner" /> Loading preset panels…</div>
          ) : panelList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <p>No trait panels created yet. Panels group traits for quick assignment during trial setup.</p>
              {canWrite && (
                <button className="btn btn-primary mt-4" onClick={() => { setEditPanel(null); setShowPanelModal(true) }}>
                  + Create First Trait Panel
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
              {panelList.map(panel => (
                <div key={panel.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--brand-300)' }}>{panel.name}</h4>
                      <div className="text-xs text-muted" style={{ marginTop: 2 }}>{panel.description || 'No description'}</div>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1">
                        <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditPanel(panel); setShowPanelModal(true) }}>✏</button>
                        <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: 'var(--status-danger)' }} onClick={() => setDeletePanel(panel)}>🗑</button>
                      </div>
                    )}
                  </div>

                  <div className="divider" />

                  <div className="text-xs font-semibold text-muted">
                    Included Variables ({panel.variable_ids.length})
                  </div>

                  <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                    {panel.variable_details && panel.variable_details.length > 0 ? (
                      panel.variable_details.map(v => (
                        <span key={v.id} className="badge badge-gray" style={{ fontSize: '0.72rem' }}>
                          {v.name}
                        </span>
                      ))
                    ) : (
                      panel.variable_ids.map(id => {
                        const v = variableList.find(x => x.id === id)
                        return (
                          <span key={id} className="badge badge-gray" style={{ fontSize: '0.72rem' }}>
                            {v ? v.name : `Trait #${id}`}
                          </span>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* Tab 3: Derived Formulas */}
      {activeTab === 'formulas' && (
        <main className="content">
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
              ➗ Calculated & Derived Trait Formulas
            </h3>
            <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
              Derived traits compute secondary parameters dynamically from primary field observations (e.g. Harvest Index, Thousand Kernel Weight, Yield Advantage relative to checks).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
              <div className="card" style={{ background: 'var(--bg-subtle)' }}>
                <div style={{ fontWeight: 700 }}>Grain Yield Advantage (% of Check)</div>
                <code className="font-mono text-xs" style={{ display: 'block', margin: '8px 0', color: 'var(--brand-300)' }}>
                  (Grain_Yield / Check_Mean_Yield) * 100
                </code>
                <div className="text-xs text-muted">Normalizes entry yield against spatial or trial-wide reference checks.</div>
              </div>

              <div className="card" style={{ background: 'var(--bg-subtle)' }}>
                <div style={{ fontWeight: 700 }}>Harvest Index (HI)</div>
                <code className="font-mono text-xs" style={{ display: 'block', margin: '8px 0', color: 'var(--brand-300)' }}>
                  Grain_Weight / Total_Biomass
                </code>
                <div className="text-xs text-muted">Efficiency of biomass partitioning into harvestable grain.</div>
              </div>

              <div className="card" style={{ background: 'var(--bg-subtle)' }}>
                <div style={{ fontWeight: 700 }}>Days to Maturity Duration</div>
                <code className="font-mono text-xs" style={{ display: 'block', margin: '8px 0', color: 'var(--brand-300)' }}>
                  Maturity_Date - Sowing_Date
                </code>
                <div className="text-xs text-muted">Phenological developmental timeframe in days.</div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Modals */}
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

      {showPanelModal && (
        <Modal
          title={editPanel ? `Edit Panel — ${editPanel.name}` : 'Create Trait Preset Panel'}
          onClose={() => { setShowPanelModal(false); setEditPanel(null) }}
        >
          <TraitPanelModal
            panel={editPanel}
            allVariables={variableList}
            onClose={() => { setShowPanelModal(false); setEditPanel(null) }}
            onSuccess={() => { setShowPanelModal(false); setEditPanel(null) }}
          />
        </Modal>
      )}

      {deleteVariable && (
        <ConfirmDialog
          message={`Delete trait variable "${deleteVariable.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteVariable(null)}
          confirmLabel="Delete Variable"
        />
      )}

      {deletePanel && (
        <ConfirmDialog
          message={`Delete trait panel "${deletePanel.name}"?`}
          onConfirm={handleDeletePanel}
          onCancel={() => setDeletePanel(null)}
          confirmLabel="Delete Panel"
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  programs, locations, seasons, observationVariables, audit,
  Program, Location, Season, ObservationVariable, ApiError
} from '../api/client'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuthStore } from '../store/authStore'

// ============================================================
// Generic helpers
// ============================================================

type Tab = 'programs' | 'locations' | 'seasons' | 'variables' | 'recent-changes'

function ApiErrorMsg({ err }: { err: unknown }) {
  if (!err) return null
  const msg = err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message
  return <div className="alert alert-error mb-4"><span>⚠</span><span>{msg}</span></div>
}

// ============================================================
// Programs sub-tab
// ============================================================

function ProgramForm({
  initial, onClose, isEdit, editId,
}: { initial?: Partial<Program>; onClose: () => void; isEdit?: boolean; editId?: number }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    crop: initial?.crop ?? 'wheat',
    description: initial?.description ?? '',
  })
  const [error, setError] = useState<unknown>(null)
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: () =>
      isEdit && editId
        ? programs.update(editId, form)
        : programs.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['programs'] }); onClose() },
    onError: setError,
  })

  return (
    <>
      <ApiErrorMsg err={error} />
      <div className="form-group mb-4">
        <label className="form-label">Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
        <input id="prog-name" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="form-group mb-4">
        <label className="form-label">Crop</label>
        <input id="prog-crop" className="form-input" value={form.crop} onChange={e => setForm(p => ({ ...p, crop: e.target.value }))} />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea id="prog-desc" className="form-input" rows={3} value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ resize: 'vertical' }} />
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mut.isPending}>Cancel</button>
        <button id="prog-save-btn" className="btn btn-primary" disabled={mut.isPending}
          onClick={() => { if (!form.name) { setError(new Error('Name is required.')); return } mut.mutate() }}>
          {mut.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (isEdit ? 'Save' : 'Add Program')}
        </button>
      </div>
    </>
  )
}

function ProgramsTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['programs'], queryFn: () => programs.list() })
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Program | null>(null)
  const [deleteItem, setDeleteItem] = useState<Program | null>(null)

  const deleteMut = useMutation({
    mutationFn: () => programs.destroy(deleteItem!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['programs'] }); setDeleteItem(null) },
  })

  return (
    <div>
      <div className="toolbar">
        <button id="add-program-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Program</button>
      </div>
      {isLoading ? <div className="loading-spinner"><div className="spinner" /></div> : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Crop</th><th>Description</th><th>Created by</th><th>Updated by</th><th style={{ width: 80 }}>Actions</th></tr></thead>
            <tbody>
              {data?.results.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td className="text-sm">{p.crop}</td>
                  <td className="text-sm text-muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '—'}</td>
                  <td className="text-sm text-muted">{p.created_by_username || '—'}</td>
                  <td className="text-sm text-muted">{p.updated_by_username || '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button id={`edit-prog-${p.id}`} className="btn btn-ghost btn-sm" onClick={() => setEditItem(p)}>✏</button>
                      <button id={`del-prog-${p.id}`} className="btn btn-ghost btn-sm" style={{ color: 'var(--status-danger)' }} onClick={() => setDeleteItem(p)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <Modal title="Add Program" onClose={() => setShowCreate(false)}><ProgramForm onClose={() => setShowCreate(false)} /></Modal>}
      {editItem && <Modal title={`Edit — ${editItem.name}`} onClose={() => setEditItem(null)}><ProgramForm initial={editItem} isEdit editId={editItem.id} onClose={() => setEditItem(null)} /></Modal>}
      {deleteItem && <ConfirmDialog message={`Delete program "${deleteItem.name}"? All associated data (seasons, germplasm, trials) will also be deleted.`} loading={deleteMut.isPending} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleteItem(null)} />}
    </div>
  )
}

// ============================================================
// Locations sub-tab
// ============================================================

function LocationForm({
  initial, onClose, isEdit, editId,
}: { initial?: Partial<Location>; onClose: () => void; isEdit?: boolean; editId?: number }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    country: initial?.country ?? '',
    region: initial?.region ?? '',
    latitude: initial?.latitude?.toString() ?? '',
    longitude: initial?.longitude?.toString() ?? '',
  })
  const [error, setError] = useState<unknown>(null)
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: () => {
      const payload: Partial<Location> = { name: form.name, country: form.country, region: form.region }
      if (form.latitude !== '') payload.latitude = parseFloat(form.latitude)
      if (form.longitude !== '') payload.longitude = parseFloat(form.longitude)
      return isEdit && editId ? locations.update(editId, payload) : locations.create(payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations-all'] }); onClose() },
    onError: setError,
  })

  return (
    <>
      <ApiErrorMsg err={error} />
      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input id="loc-name" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Country</label>
          <input id="loc-country" className="form-input" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Region</label>
          <input id="loc-region" className="form-input" value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Latitude (−90 to 90)</label>
          <input id="loc-lat" className="form-input" type="number" step="any" min={-90} max={90} value={form.latitude} onChange={e => setForm(p => ({ ...p, latitude: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Longitude (−180 to 180)</label>
          <input id="loc-lon" className="form-input" type="number" step="any" min={-180} max={180} value={form.longitude} onChange={e => setForm(p => ({ ...p, longitude: e.target.value }))} />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mut.isPending}>Cancel</button>
        <button id="loc-save-btn" className="btn btn-primary" disabled={mut.isPending}
          onClick={() => { if (!form.name) { setError(new Error('Name is required.')); return } mut.mutate() }}>
          {mut.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (isEdit ? 'Save' : 'Add Location')}
        </button>
      </div>
    </>
  )
}

function LocationsTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['locations-all'], queryFn: () => locations.list() })
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Location | null>(null)
  const [deleteItem, setDeleteItem] = useState<Location | null>(null)

  const deleteMut = useMutation({
    mutationFn: () => locations.destroy(deleteItem!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations-all'] }); setDeleteItem(null) },
  })

  return (
    <div>
      <div className="toolbar">
        <button id="add-location-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Location</button>
      </div>
      {isLoading ? <div className="loading-spinner"><div className="spinner" /></div> : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Country</th><th>Region</th><th>Lat</th><th>Lon</th><th>Created by</th><th>Updated by</th><th style={{ width: 80 }}>Actions</th></tr></thead>
            <tbody>
              {data?.results.map(l => (
                <tr key={l.id}>
                  <td><strong>{l.name}</strong></td>
                  <td className="text-sm">{l.country || '—'}</td>
                  <td className="text-sm">{l.region || '—'}</td>
                  <td className="font-mono text-sm">{l.latitude ?? '—'}</td>
                  <td className="font-mono text-sm">{l.longitude ?? '—'}</td>
                  <td className="text-sm text-muted">{l.created_by_username || '—'}</td>
                  <td className="text-sm text-muted">{l.updated_by_username || '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button id={`edit-loc-${l.id}`} className="btn btn-ghost btn-sm" onClick={() => setEditItem(l)}>✏</button>
                      <button id={`del-loc-${l.id}`} className="btn btn-ghost btn-sm" style={{ color: 'var(--status-danger)' }} onClick={() => setDeleteItem(l)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <Modal title="Add Location" onClose={() => setShowCreate(false)}><LocationForm onClose={() => setShowCreate(false)} /></Modal>}
      {editItem && <Modal title={`Edit — ${editItem.name}`} onClose={() => setEditItem(null)}><LocationForm initial={editItem} isEdit editId={editItem.id} onClose={() => setEditItem(null)} /></Modal>}
      {deleteItem && <ConfirmDialog message={`Delete location "${deleteItem.name}"?`} loading={deleteMut.isPending} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleteItem(null)} />}
    </div>
  )
}

// ============================================================
// Seasons sub-tab
// ============================================================

function SeasonForm({
  initial, onClose, isEdit, editId, programList,
}: { initial?: Partial<Season>; onClose: () => void; isEdit?: boolean; editId?: number; programList: Program[] }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    year: initial?.year?.toString() ?? new Date().getFullYear().toString(),
    program: initial?.program?.toString() ?? (programList[0]?.id?.toString() ?? ''),
  })
  const [error, setError] = useState<unknown>(null)
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: () => {
      const payload = { name: form.name, year: Number(form.year), program: Number(form.program) }
      return isEdit && editId ? seasons.update(editId, payload) : seasons.create(payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['seasons-all'] }); onClose() },
    onError: setError,
  })

  return (
    <>
      <ApiErrorMsg err={error} />
      <div className="form-group mb-4">
        <label className="form-label">Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
        <input id="season-name" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. 2027 Spring Season" />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Year <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input id="season-year" className="form-input" type="number" min={2000} max={2100} value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select id="season-program" className="form-input" value={form.program} onChange={e => setForm(p => ({ ...p, program: e.target.value }))}>
            {programList.map(prog => <option key={prog.id} value={prog.id}>{prog.name}</option>)}
          </select>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mut.isPending}>Cancel</button>
        <button id="season-save-btn" className="btn btn-primary" disabled={mut.isPending}
          onClick={() => { if (!form.name || !form.program) { setError(new Error('Name and Program are required.')); return } mut.mutate() }}>
          {mut.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (isEdit ? 'Save' : 'Add Season')}
        </button>
      </div>
    </>
  )
}

function SeasonsTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['seasons-all'], queryFn: () => seasons.list() })
  const { data: progsData } = useQuery({ queryKey: ['programs'], queryFn: () => programs.list() })
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<Season | null>(null)
  const [deleteItem, setDeleteItem] = useState<Season | null>(null)

  const programList = progsData?.results ?? []

  const deleteMut = useMutation({
    mutationFn: () => seasons.destroy(deleteItem!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['seasons-all'] }); setDeleteItem(null) },
  })

  return (
    <div>
      <div className="toolbar">
        <button id="add-season-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Season</button>
      </div>
      {isLoading ? <div className="loading-spinner"><div className="spinner" /></div> : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Year</th><th>Program</th><th>Created by</th><th>Updated by</th><th style={{ width: 80 }}>Actions</th></tr></thead>
            <tbody>
              {data?.results.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td className="font-mono text-sm">{s.year}</td>
                  <td className="text-sm text-muted">{s.program_name}</td>
                  <td className="text-sm text-muted">{s.created_by_username || '—'}</td>
                  <td className="text-sm text-muted">{s.updated_by_username || '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button id={`edit-season-${s.id}`} className="btn btn-ghost btn-sm" onClick={() => setEditItem(s)}>✏</button>
                      <button id={`del-season-${s.id}`} className="btn btn-ghost btn-sm" style={{ color: 'var(--status-danger)' }} onClick={() => setDeleteItem(s)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <Modal title="Add Season" onClose={() => setShowCreate(false)}><SeasonForm programList={programList} onClose={() => setShowCreate(false)} /></Modal>}
      {editItem && <Modal title={`Edit — ${editItem.name}`} onClose={() => setEditItem(null)}><SeasonForm initial={editItem} isEdit editId={editItem.id} programList={programList} onClose={() => setEditItem(null)} /></Modal>}
      {deleteItem && <ConfirmDialog message={`Delete season "${deleteItem.name}"? Any trials linked to this season will be affected.`} loading={deleteMut.isPending} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleteItem(null)} />}
    </div>
  )
}

// ============================================================
// Observation Variables sub-tab
// ============================================================

const DATA_TYPES = ['numeric', 'integer', 'categorical', 'text', 'date']

function VariableForm({
  initial, onClose, isEdit, editId,
}: { initial?: Partial<ObservationVariable>; onClose: () => void; isEdit?: boolean; editId?: number }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    variable_code: initial?.variable_code ?? '',
    unit: initial?.unit ?? '',
    data_type: initial?.data_type ?? 'numeric',
    min_value: initial?.min_value?.toString() ?? '',
    max_value: initial?.max_value?.toString() ?? '',
    is_required: initial?.is_required ?? false,
    description: initial?.description ?? '',
  })
  const [error, setError] = useState<unknown>(null)
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: () => {
      const payload: Partial<ObservationVariable> = {
        name: form.name,
        variable_code: form.variable_code,
        unit: form.unit,
        data_type: form.data_type,
        is_required: form.is_required,
        description: form.description,
      }
      if (form.min_value !== '') payload.min_value = parseFloat(form.min_value)
      if (form.max_value !== '') payload.max_value = parseFloat(form.max_value)
      return isEdit && editId ? observationVariables.update(editId, payload) : observationVariables.create(payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['observation-variables'] }); onClose() },
    onError: setError,
  })

  return (
    <>
      <ApiErrorMsg err={error} />
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input id="var-name" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Spike length" />
        </div>
        <div className="form-group">
          <label className="form-label">Code</label>
          <input id="var-code" className="form-input" value={form.variable_code} onChange={e => setForm(p => ({ ...p, variable_code: e.target.value }))} placeholder="e.g. SL" />
        </div>
        <div className="form-group">
          <label className="form-label">Unit</label>
          <input id="var-unit" className="form-input" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="e.g. cm" />
        </div>
        <div className="form-group">
          <label className="form-label">Data Type</label>
          <select id="var-dtype" className="form-input" value={form.data_type} onChange={e => setForm(p => ({ ...p, data_type: e.target.value }))}>
            {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Min Value</label>
          <input id="var-min" className="form-input" type="number" step="any" value={form.min_value} onChange={e => setForm(p => ({ ...p, min_value: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Max Value</label>
          <input id="var-max" className="form-input" type="number" step="any" value={form.max_value} onChange={e => setForm(p => ({ ...p, max_value: e.target.value }))} />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Description</label>
          <textarea id="var-desc" className="form-input" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ resize: 'vertical' }} />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="flex items-center gap-3" style={{ cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <input id="var-required" type="checkbox" checked={form.is_required} onChange={e => setForm(p => ({ ...p, is_required: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            Required field (cannot be left blank during observation entry)
          </label>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mut.isPending}>Cancel</button>
        <button id="var-save-btn" className="btn btn-primary" disabled={mut.isPending}
          onClick={() => { if (!form.name) { setError(new Error('Name is required.')); return } mut.mutate() }}>
          {mut.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (isEdit ? 'Save' : 'Add Variable')}
        </button>
      </div>
    </>
  )
}

function VariablesTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['observation-variables'], queryFn: () => observationVariables.list() })
  const [showCreate, setShowCreate] = useState(false)
  const [editItem, setEditItem] = useState<ObservationVariable | null>(null)
  const [deleteItem, setDeleteItem] = useState<ObservationVariable | null>(null)

  const deleteMut = useMutation({
    mutationFn: () => observationVariables.destroy(deleteItem!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['observation-variables'] }); setDeleteItem(null) },
  })

  return (
    <div>
      <div className="toolbar">
        <button id="add-variable-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Variable</button>
      </div>
      {isLoading ? <div className="loading-spinner"><div className="spinner" /></div> : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Code</th><th>Unit</th><th>Type</th><th>Min</th><th>Max</th><th>Required</th><th>Created by</th><th>Updated by</th><th style={{ width: 80 }}>Actions</th></tr></thead>
            <tbody>
              {data?.results.map(v => (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong></td>
                  <td className="font-mono text-sm">{v.variable_code || '—'}</td>
                  <td className="text-sm">{v.unit || '—'}</td>
                  <td><span className="badge badge-gray">{v.data_type}</span></td>
                  <td className="font-mono text-sm">{v.min_value ?? '—'}</td>
                  <td className="font-mono text-sm">{v.max_value ?? '—'}</td>
                  <td>{v.is_required ? <span className="badge badge-amber">yes</span> : <span className="text-muted text-sm">no</span>}</td>
                  <td className="text-sm text-muted">{v.created_by_username || '—'}</td>
                  <td className="text-sm text-muted">{v.updated_by_username || '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button id={`edit-var-${v.id}`} className="btn btn-ghost btn-sm" onClick={() => setEditItem(v)}>✏</button>
                      <button id={`del-var-${v.id}`} className="btn btn-ghost btn-sm" style={{ color: 'var(--status-danger)' }} onClick={() => setDeleteItem(v)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <Modal title="Add Observation Variable" onClose={() => setShowCreate(false)}><VariableForm onClose={() => setShowCreate(false)} /></Modal>}
      {editItem && <Modal title={`Edit — ${editItem.name}`} onClose={() => setEditItem(null)}><VariableForm initial={editItem} isEdit editId={editItem.id} onClose={() => setEditItem(null)} /></Modal>}
      {deleteItem && <ConfirmDialog message={`Delete variable "${deleteItem.name}"? All existing observations for this variable will also be deleted.`} loading={deleteMut.isPending} onConfirm={() => deleteMut.mutate()} onCancel={() => setDeleteItem(null)} />}
    </div>
  )
}

// ============================================================
// Recent Changes (Audit log) sub-tab
// ============================================================

function RecentChangesTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['recent-changes'],
    queryFn: () => audit.recentChanges(100),
  })

  return (
    <div>
      <ApiErrorMsg err={error} />
      {isLoading ? (
        <div className="loading-spinner">
          <div className="spinner" />
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Record Label</th>
                <th>Created By</th>
                <th>Created At</th>
                <th>Updated By</th>
                <th>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((entry, idx) => (
                <tr key={`${entry.model}-${entry.id}-${idx}`}>
                  <td>
                    <span className="badge badge-gray">{entry.model}</span>
                  </td>
                  <td>
                    <strong>{entry.label}</strong>
                  </td>
                  <td className="text-sm">{entry.created_by || '—'}</td>
                  <td className="text-sm text-muted">
                    {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="text-sm">{entry.updated_by || '—'}</td>
                  <td className="text-sm text-muted">
                    {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No recent changes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Main Setup page
// ============================================================

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'programs',  label: 'Programs',              icon: '🗂' },
  { key: 'locations', label: 'Locations',             icon: '📍' },
  { key: 'seasons',   label: 'Seasons',               icon: '🌤' },
  { key: 'variables', label: 'Observation Variables', icon: '📋' },
]

export default function Setup() {
  const role = useAuthStore(s => s.role)
  const [activeTab, setActiveTab] = useState<Tab>('programs')

  const visibleTabs = [...TABS]
  if (role === 'admin') {
    visibleTabs.push({ key: 'recent-changes', label: 'Recent Changes', icon: '📜' })
  }

  return (
    <div className="page-shell">
      <TopBar
        title="Setup"
        subtitle="Manage programs, locations, seasons, and observation variables"
      />

      <div className="tab-bar mb-8">
        {visibleTabs.map(t => (
          <button
            key={t.key}
            id={`setup-tab-${t.key}`}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'programs'  && <ProgramsTab />}
      {activeTab === 'locations' && <LocationsTab />}
      {activeTab === 'seasons'   && <SeasonsTab />}
      {activeTab === 'variables' && <VariablesTab />}
      {activeTab === 'recent-changes' && role === 'admin' && <RecentChangesTab />}
    </div>
  )
}

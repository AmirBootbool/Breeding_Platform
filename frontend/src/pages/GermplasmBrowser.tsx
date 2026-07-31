import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { germplasm, programs, Germplasm, Program, ApiError } from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

// ---- Cross type badge -------------------------------------------------------
function CrossTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    biparental: 'badge-green',
    backcross: 'badge-amber',
    doubled_haploid: 'badge-blue',
    self: 'badge-gray',
    other: 'badge-gray',
    unknown: 'badge-gray',
  }
  return <span className={`badge ${map[type] ?? 'badge-gray'}`}>{type}</span>
}

// ---- Pedigree panel ---------------------------------------------------------
function PedigreePanel({ entry }: { entry: Germplasm }) {
  return (
    <div className="pedigree-panel slide-in">
      <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{entry.name}</h3>
      <p className="text-xs text-muted font-mono">{entry.germplasm_db_id}</p>
      <div className="divider" />
      <div className="pedigree-row">
        <span className="pedigree-label">Species</span>
        <span className="text-sm">{entry.species || '—'}</span>
      </div>
      <div className="pedigree-row">
        <span className="pedigree-label">Program</span>
        <span className="text-sm">{entry.program_name}</span>
      </div>
      <div className="pedigree-row">
        <span className="pedigree-label">Type</span>
        <CrossTypeBadge type={entry.cross_type} />
      </div>
      <div className="pedigree-row">
        <span className="pedigree-label">Year</span>
        <span className="text-sm">{entry.year_developed ?? '—'}</span>
      </div>
      <div className="divider" />
      <div className="card-title" style={{ marginBottom: 'var(--space-2)' }}>Pedigree</div>
      <div className="pedigree-row">
        <span className="pedigree-label">♀ Female</span>
        <span className="text-sm">{entry.parent_female_name ?? 'Unknown'}</span>
      </div>
      <div className="pedigree-row">
        <span className="pedigree-label">♂ Male</span>
        <span className="text-sm">{entry.parent_male_name ?? 'Unknown'}</span>
      </div>
      {entry.pedigree_string && (
        <div className="pedigree-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className="pedigree-label">String</span>
          <code className="font-mono text-xs" style={{ color: 'var(--brand-300)', wordBreak: 'break-all' }}>
            {entry.pedigree_string}
          </code>
        </div>
      )}
      {entry.notes && (
        <>
          <div className="divider" />
          <p className="text-xs text-muted" style={{ lineHeight: 1.7 }}>{entry.notes}</p>
        </>
      )}
    </div>
  )
}

// ---- Germplasm form ---------------------------------------------------------
const CROSS_TYPES = ['biparental', 'self', 'backcross', 'doubled_haploid', 'other', 'unknown']

interface GermplasmFormProps {
  initial?: Partial<Germplasm>
  programList: Program[]
  germplasmList: Germplasm[]
  onClose: () => void
  onSaved: () => void
  isEdit?: boolean
  editId?: number
}

function GermplasmForm({ initial, programList, germplasmList, onClose, onSaved, isEdit, editId }: GermplasmFormProps) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    species: initial?.species ?? 'Triticum aestivum',
    program: initial?.program ?? (programList[0]?.id ?? ''),
    cross_type: initial?.cross_type ?? 'unknown',
    year_developed: initial?.year_developed?.toString() ?? '',
    parent_female: initial?.parent_female?.toString() ?? '',
    parent_male: initial?.parent_male?.toString() ?? '',
    pedigree_string: initial?.pedigree_string ?? '',
    notes: initial?.notes ?? '',
  })
  const [error, setError] = useState('')

  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        species: form.species,
        program: Number(form.program),
        cross_type: form.cross_type,
        pedigree_string: form.pedigree_string,
        notes: form.notes,
      }
      if (form.year_developed) payload.year_developed = Number(form.year_developed)
      if (form.parent_female) payload.parent_female = Number(form.parent_female)
      if (form.parent_male) payload.parent_male = Number(form.parent_male)

      return isEdit && editId
        ? germplasm.update(editId, payload)
        : germplasm.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['germplasm'] })
      onSaved()
      onClose()
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(JSON.stringify(err.detail))
      } else {
        setError((err as Error).message)
      }
    },
  })

  function set(field: string, val: string) {
    setForm(prev => ({ ...prev, [field]: val }))
  }

  return (
    <>
      {error && (
        <div className="alert alert-error mb-4">
          <span>⚠</span><span>{error}</span>
        </div>
      )}
      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input id="germ-name" className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. KAN-WHEAT-04" required />
        </div>
        <div className="form-group">
          <label className="form-label">Species</label>
          <input id="germ-species" className="form-input" value={form.species} onChange={e => set('species', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select id="germ-program" className="form-input" value={form.program} onChange={e => set('program', e.target.value)}>
            {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Cross Type</label>
          <select id="germ-cross-type" className="form-input" value={form.cross_type} onChange={e => set('cross_type', e.target.value)}>
            {CROSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Year Developed</label>
          <input id="germ-year" className="form-input" type="number" value={form.year_developed} onChange={e => set('year_developed', e.target.value)} placeholder="e.g. 2025" />
        </div>
        <div className="form-group">
          <label className="form-label">♀ Female Parent</label>
          <select id="germ-female" className="form-input" value={form.parent_female} onChange={e => set('parent_female', e.target.value)}>
            <option value="">— None —</option>
            {germplasmList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">♂ Male Parent</label>
          <select id="germ-male" className="form-input" value={form.parent_male} onChange={e => set('parent_male', e.target.value)}>
            <option value="">— None —</option>
            {germplasmList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Pedigree String</label>
          <input id="germ-pedigree" className="form-input" value={form.pedigree_string} onChange={e => set('pedigree_string', e.target.value)} placeholder="e.g. KAUZ/PASTOR" />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Notes</label>
          <textarea id="germ-notes" className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button
          id="germ-save-btn"
          className="btn btn-primary"
          onClick={() => { if (!form.name || !form.program) { setError('Name and Program are required.'); return } mutation.mutate() }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (isEdit ? 'Save Changes' : 'Add Germplasm')}
        </button>
      </div>
    </>
  )
}

interface BulkImportFormProps {
  programList: Program[]
  onClose: () => void
  onSaved: () => void
}

function BulkImportForm({ programList, onClose, onSaved }: BulkImportFormProps) {
  const [file, setFile] = useState<File | null>(null)
  const [program, setProgram] = useState(programList[0]?.name ?? '')
  const [dryRun, setDryRun] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    created: number
    skipped: number
    errors: { row: number; detail: string }[]
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const qc = useQueryClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !program) {
      setError('File and program are required.')
      return
    }
    setError('')
    setResult(null)
    setLoading(true)

    try {
      const res = await germplasm.bulkImport(file, program, dryRun)
      setResult(res)
      if (!dryRun && res.errors.length === 0) {
        qc.invalidateQueries({ queryKey: ['germplasm'] })
        onSaved()
        onClose()
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.detail as { errors?: { row: number; detail: string }[] }
        if (details?.errors) {
          setResult({ created: 0, skipped: 0, errors: details.errors })
        } else {
          setError(JSON.stringify(err.detail))
        }
      } else {
        setError((err as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert alert-error mb-4">
          <span>⚠</span><span>{error}</span>
        </div>
      )}

      {result && result.errors.length > 0 && (
        <div className="alert alert-error mb-4" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 600 }}>Import failed with errors (changes rolled back):</div>
          <div className="table-container" style={{ marginTop: 'var(--space-2)', maxHeight: 200, overflowY: 'auto', width: '100%' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Row</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((err, idx) => (
                  <tr key={idx}>
                    <td>{err.row}</td>
                    <td style={{ color: 'var(--status-danger)' }}>{err.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && result.errors.length === 0 && (
        <div className="alert alert-success mb-4">
          <span>✓</span>
          <span>
            {dryRun
              ? `Validation successful: ${result.created} rows validated, ${result.skipped} duplicates skipped.`
              : `Successfully imported ${result.created} rows. ${result.skipped} duplicates skipped.`}
          </span>
        </div>
      )}

      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select
            id="bulk-import-program"
            className="form-input"
            value={program}
            onChange={e => setProgram(e.target.value)}
            required
          >
            <option value="">— Select Program —</option>
            {programList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">CSV File <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input
            id="bulk-import-file"
            type="file"
            accept=".csv"
            className="form-input"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            required
          />
          <span className="text-xs text-muted">
            Expected headers: <code>name</code> (required), <code>species</code>, <code>pedigree_string</code>, <code>cross_type</code>, <code>year_developed</code>, <code>notes</code>
          </span>
        </div>

        <div className="form-group" style={{ gridColumn: '1/-1', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            id="bulk-import-dry-run"
            type="checkbox"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
          />
          <label htmlFor="bulk-import-dry-run" className="form-label" style={{ marginBottom: 0 }}>
            Validate only (dry run)
          </label>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button
          id="bulk-import-submit-btn"
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Uploading…</> : 'Upload & Process'}
        </button>
      </div>
    </form>
  )
}

// ---- Main page --------------------------------------------------------------
export default function GermplasmBrowser() {
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [search, setSearch] = useState('')
  const [crossType, setCrossType] = useState('')
  const [selected, setSelected] = useState<Germplasm | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [editEntry, setEditEntry] = useState<Germplasm | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<Germplasm | null>(null)

  const params = [
    search ? `&search=${encodeURIComponent(search)}` : '',
    crossType ? `&cross_type=${encodeURIComponent(crossType)}` : '',
  ].join('')

  const qc = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['germplasm', search, crossType],
    queryFn: () => germplasm.list(params),
    placeholderData: prev => prev,
  })

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })

  const { data: allGermplasmData } = useQuery({
    queryKey: ['germplasm-all'],
    queryFn: () => germplasm.listAll(),
    enabled: showCreate || !!editEntry,
  })

  const deleteMutation = useMutation({
    mutationFn: () => germplasm.destroy(deleteEntry!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['germplasm'] })
      setDeleteEntry(null)
      if (selected?.id === deleteEntry?.id) setSelected(null)
    },
  })

  const programList = programsData?.results ?? []
  const germplasmList = allGermplasmData?.results ?? []

  return (
    <div className="page-shell">
      <TopBar
        title="Germplasm Browser"
        subtitle={`${data?.count ?? '…'} entries registered`}
        actions={canWrite ? (
          <div className="flex gap-2">
            <button id="bulk-import-btn" className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>
              Bulk Import
            </button>
            <button id="add-germplasm-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Add Germplasm
            </button>
          </div>
        ) : undefined}
      />

      <div className="toolbar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            id="germplasm-search"
            type="search"
            placeholder="Search by name, species…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          id="cross-type-filter"
          className="form-input"
          style={{ width: 180 }}
          value={crossType}
          onChange={e => setCrossType(e.target.value)}
        >
          <option value="">All types</option>
          {CROSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {isFetching && !isLoading && (
          <div className="spinner" style={{ width: 16, height: 16 }} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 320px' : '1fr', gap: 'var(--space-6)' }}>
        <div>
          {isLoading ? (
            <div className="loading-spinner"><div className="spinner" /> Loading germplasm…</div>
          ) : data?.results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🌱</div>
              <p>No germplasm entries found.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Species</th>
                    <th>Type</th>
                    <th>Year</th>
                    <th>Program</th>
                    {canWrite && <th style={{ width: 80 }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {data?.results.map(entry => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelected(prev => prev?.id === entry.id ? null : entry)}
                      style={{ cursor: 'pointer' }}
                      className={selected?.id === entry.id ? 'selected-row' : ''}
                    >
                      <td><strong>{entry.name}</strong></td>
                      <td className="font-mono text-sm text-muted">{entry.germplasm_db_id}</td>
                      <td className="text-sm text-muted">{entry.species || '—'}</td>
                      <td><CrossTypeBadge type={entry.cross_type} /></td>
                      <td className="text-sm">{entry.year_developed ?? '—'}</td>
                      <td className="text-sm text-muted">{entry.program_name}</td>
                      {canWrite && (
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex gap-2">
                            <button
                              id={`edit-germ-${entry.id}`}
                              className="btn btn-ghost btn-sm"
                              title="Edit"
                              onClick={() => setEditEntry(entry)}
                            >✏</button>
                            <button
                              id={`delete-germ-${entry.id}`}
                              className="btn btn-ghost btn-sm"
                              title="Delete"
                              style={{ color: 'var(--status-danger)' }}
                              onClick={() => setDeleteEntry(entry)}
                            >🗑</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && <PedigreePanel entry={selected} />}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal title="Add Germplasm" onClose={() => setShowCreate(false)}>
          <GermplasmForm
            programList={programList}
            germplasmList={germplasmList}
            onClose={() => setShowCreate(false)}
            onSaved={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {/* Bulk Import modal */}
      {showBulkImport && (
        <Modal title="Bulk Import Germplasm" onClose={() => setShowBulkImport(false)}>
          <BulkImportForm
            programList={programList}
            onClose={() => setShowBulkImport(false)}
            onSaved={() => setShowBulkImport(false)}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editEntry && (
        <Modal title={`Edit — ${editEntry.name}`} onClose={() => setEditEntry(null)}>
          <GermplasmForm
            initial={editEntry}
            programList={programList}
            germplasmList={germplasmList.filter(g => g.id !== editEntry.id)}
            onClose={() => setEditEntry(null)}
            onSaved={() => setEditEntry(null)}
            isEdit
            editId={editEntry.id}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteEntry && (
        <ConfirmDialog
          message={`Delete "${deleteEntry.name}"? This cannot be undone. Any plots using this germplasm will be affected.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteEntry(null)}
        />
      )}
    </div>
  )
}

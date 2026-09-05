import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { germplasm, programs, Germplasm, Program, ApiError } from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SendToTrialModal from '../components/SendToTrialModal'
import PedigreeTreeModal from '../components/pedigree/PedigreeTreeModal'

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

const GEN_LABELS: Record<number, string> = {
  0: 'F0 (P)', 1: 'F1', 2: 'F2', 3: 'F3', 4: 'F4',
  5: 'F5', 6: 'F6', 7: 'F7', 8: 'F8+',
}

// ---- Pedigree panel ---------------------------------------------------------
function PedigreePanel({ entry, onOpenTree }: { entry: Germplasm; onOpenTree: (entry: Germplasm) => void }) {
  return (
    <div className="pedigree-panel slide-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{entry.name}</h3>
          <p className="text-xs text-muted font-mono">{entry.germplasm_db_id}</p>
        </div>
        {entry.is_check && <span className="badge badge-amber">CHECK</span>}
      </div>
      
      <button 
        className="btn btn-primary" 
        style={{ width: '100%', marginTop: 'var(--space-3)', marginBottom: 'var(--space-3)', justifyContent: 'center' }}
        onClick={() => onOpenTree(entry)}
      >
        🌳 View Pedigree Tree
      </button>

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
        <span className="pedigree-label">Generation</span>
        <span className="text-sm font-semibold">{GEN_LABELS[entry.generation] ?? `F${entry.generation}`}</span>
      </div>
      <div className="pedigree-row">
        <span className="pedigree-label">Type</span>
        <CrossTypeBadge type={entry.cross_type} />
      </div>
      <div className="pedigree-row">
        <span className="pedigree-label">Year</span>
        <span className="text-sm">{entry.year_developed ?? '—'}</span>
      </div>
      {entry.tags && entry.tags.length > 0 && (
        <div className="pedigree-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
          <span className="pedigree-label">Tags</span>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {entry.tags.map(t => (
              <span key={t} className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{t}</span>
            ))}
          </div>
        </div>
      )}
      <div className="divider" />
      <div className="card-title" style={{ marginBottom: 'var(--space-2)' }}>Parents</div>
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
          <span className="pedigree-label">Pedigree String</span>
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
    generation: initial?.generation?.toString() ?? '0',
    year_developed: initial?.year_developed?.toString() ?? '',
    parent_female: initial?.parent_female?.toString() ?? '',
    parent_male: initial?.parent_male?.toString() ?? '',
    pedigree_string: initial?.pedigree_string ?? '',
    is_check: initial?.is_check ?? false,
    tags: (initial?.tags ?? []).join(', '),
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
        generation: Number(form.generation),
        pedigree_string: form.pedigree_string,
        is_check: form.is_check,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
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

  function set(field: string, val: unknown) {
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
          <label className="form-label">Generation</label>
          <select id="germ-generation" className="form-input" value={form.generation} onChange={e => set('generation', e.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(g => (
              <option key={g} value={g}>{GEN_LABELS[g] ?? `F${g}`}</option>
            ))}
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
          <label className="form-label">Tags (comma-separated)</label>
          <input id="germ-tags" className="form-input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="e.g. drought-tolerant, rust-resistant, high-protein" />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Pedigree String</label>
          <input id="germ-pedigree" className="form-input" value={form.pedigree_string} onChange={e => set('pedigree_string', e.target.value)} placeholder="e.g. KAUZ/PASTOR" />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            id="germ-is-check"
            type="checkbox"
            checked={form.is_check}
            onChange={e => set('is_check', e.target.checked)}
          />
          <label htmlFor="germ-is-check" className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>
            Permanent Check / Reference Line
          </label>
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

// ---- Side-by-Side Comparison Modal -------------------------------------------
function ComparisonModal({ entries, onClose }: { entries: Germplasm[]; onClose: () => void }) {
  return (
    <Modal title={`Compare Germplasm (${entries.length} selected)`} onClose={onClose}>
      <div className="table-container" style={{ overflowX: 'auto', maxHeight: '500px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>Attribute</th>
              {entries.map(e => (
                <th key={e.id} style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, color: 'var(--brand-300)' }}>{e.name}</div>
                  <div className="text-xs font-mono text-muted">{e.germplasm_db_id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Check Line?</strong></td>
              {entries.map(e => (
                <td key={e.id}>{e.is_check ? <span className="badge badge-amber">CHECK</span> : <span className="badge badge-gray">Candidate</span>}</td>
              ))}
            </tr>
            <tr>
              <td><strong>Program</strong></td>
              {entries.map(e => <td key={e.id}>{e.program_name}</td>)}
            </tr>
            <tr>
              <td><strong>Generation</strong></td>
              {entries.map(e => <td key={e.id} className="font-semibold">{GEN_LABELS[e.generation] ?? `F${e.generation}`}</td>)}
            </tr>
            <tr>
              <td><strong>Cross Type</strong></td>
              {entries.map(e => <td key={e.id}><CrossTypeBadge type={e.cross_type} /></td>)}
            </tr>
            <tr>
              <td><strong>♀ Female Parent</strong></td>
              {entries.map(e => <td key={e.id}>{e.parent_female_name || '—'}</td>)}
            </tr>
            <tr>
              <td><strong>♂ Male Parent</strong></td>
              {entries.map(e => <td key={e.id}>{e.parent_male_name || '—'}</td>)}
            </tr>
            <tr>
              <td><strong>Pedigree String</strong></td>
              {entries.map(e => <td key={e.id} className="font-mono text-xs">{e.pedigree_string || '—'}</td>)}
            </tr>
            <tr>
              <td><strong>Tags</strong></td>
              {entries.map(e => (
                <td key={e.id}>
                  <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                    {(e.tags || []).map(t => <span key={t} className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{t}</span>)}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td><strong>Notes</strong></td>
              {entries.map(e => <td key={e.id} className="text-xs text-muted">{e.notes || '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
        <button className="btn btn-secondary" onClick={onClose}>Close Comparison</button>
      </div>
    </Modal>
  )
}

// ---- Main page --------------------------------------------------------------
export default function GermplasmBrowser() {
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [search, setSearch] = useState('')
  const [crossType, setCrossType] = useState('')
  const [selectedProgram, setSelectedProgram] = useState('')
  const [selectedGen, setSelectedGen] = useState('')
  const [onlyChecks, setOnlyChecks] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')

  const [selected, setSelected] = useState<Germplasm | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [advancedIds, setAdvancedIds] = useState<number[]>([])
  const [showAdvanceSuccessPrompt, setShowAdvanceSuccessPrompt] = useState(false)
  const [showSendToTrialModal, setShowSendToTrialModal] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [editEntry, setEditEntry] = useState<Germplasm | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<Germplasm | null>(null)
  const [treeTarget, setTreeTarget] = useState<Germplasm | null>(null)

  const params = [
    search ? `&search=${encodeURIComponent(search)}` : '',
    crossType ? `&cross_type=${encodeURIComponent(crossType)}` : '',
    selectedProgram ? `&program=${encodeURIComponent(selectedProgram)}` : '',
    selectedGen !== '' ? `&generation=${encodeURIComponent(selectedGen)}` : '',
    showArchived ? '&archived=true' : '',
  ].join('')

  const qc = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['germplasm', search, crossType, selectedProgram, selectedGen, showArchived],
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

  const advanceMutation = useMutation({
    mutationFn: (vars: { method: string; ssdCount: number }) =>
      germplasm.advanceGeneration(selectedIds, vars.method, vars.ssdCount),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['germplasm'] })
      setSelectedIds([])
      setShowAdvanceModal(false)
      setAdvancedIds(res.created_ids)
      setShowAdvanceSuccessPrompt(true)
    },
  })

  const bulkArchiveMutation = useMutation({
    mutationFn: () => germplasm.bulkArchive(selectedIds),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['germplasm'] })
      setSelectedIds([])
      setShowArchiveConfirm(false)
      alert(`Archived ${res.archived_count} accessions.`)
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => germplasm.bulkDelete(selectedIds),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['germplasm'] })
      setSelectedIds([])
      setShowDeleteConfirm(false)
      alert(`Deleted ${res.deleted_count} accessions.`)
    },
  })

  const programList = programsData?.results ?? []
  const germplasmList = allGermplasmData?.results ?? []

  const filteredResults = useMemo(() => {
    let list = data?.results ?? []
    if (onlyChecks) {
      list = list.filter(g => g.is_check)
    }
    return list
  }, [data, onlyChecks])

  const selectedEntries = useMemo(() => {
    return (data?.results ?? []).filter(g => selectedIds.includes(g.id))
  }, [data, selectedIds])

  const exportSelectedCsv = () => {
    const list = selectedEntries.length > 0 ? selectedEntries : (data?.results ?? [])
    const header = ['id', 'name', 'germplasm_db_id', 'program', 'generation', 'cross_type', 'is_check', 'pedigree', 'year'].join(',')
    const rows = list.map(g => [
      g.id,
      `"${g.name}"`,
      `"${g.germplasm_db_id}"`,
      `"${g.program_name}"`,
      g.generation,
      `"${g.cross_type}"`,
      g.is_check,
      `"${g.pedigree_string || ''}"`,
      g.year_developed || '',
    ].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `germplasm_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="page-shell">
      <TopBar
        title="Germplasm Browser"
        subtitle={`${filteredResults.length} entries shown (${data?.count ?? 0} total)`}
        actions={canWrite ? (
          <div className="flex gap-2">
            <button id="add-germplasm-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Add Germplasm
            </button>
          </div>
        ) : undefined}
      />

      {/* Multi-Filter Toolbar */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div className="search-bar" style={{ minWidth: 200, flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input
            id="germplasm-search"
            type="search"
            placeholder="Search by name, ID, pedigree…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          id="program-filter"
          className="form-input"
          style={{ width: 150 }}
          value={selectedProgram}
          onChange={e => setSelectedProgram(e.target.value)}
        >
          <option value="">All Programs</option>
          {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select
          id="generation-filter"
          className="form-input"
          style={{ width: 120 }}
          value={selectedGen}
          onChange={e => setSelectedGen(e.target.value)}
        >
          <option value="">All Gen</option>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(g => (
            <option key={g} value={g}>{GEN_LABELS[g] ?? `F${g}`}</option>
          ))}
        </select>

        <select
          id="cross-type-filter"
          className="form-input"
          style={{ width: 140 }}
          value={crossType}
          onChange={e => setCrossType(e.target.value)}
        >
          <option value="">All types</option>
          {CROSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <button
          className={`btn btn-sm ${onlyChecks ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setOnlyChecks(prev => !prev)}
        >
          ⭐ Checks Only
        </button>

        {/* View toggle */}
        <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-default)' }}>
          <button
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 0, padding: '4px 10px' }}
            onClick={() => setViewMode('table')}
          >
            📋 Table
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 0, padding: '4px 10px' }}
            onClick={() => setViewMode('grid')}
          >
            🔲 Cards
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm ml-auto">
          <input type="checkbox" id="show-archived" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          <label htmlFor="show-archived" style={{ marginBottom: 0 }}>Archived</label>
        </div>

        {isFetching && !isLoading && (
          <div className="spinner" style={{ width: 16, height: 16 }} />
        )}
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="alert alert-info slide-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <span style={{ fontWeight: 600 }}>{selectedIds.length} accessions selected</span>
          <div className="flex gap-2">
            {selectedIds.length >= 2 && selectedIds.length <= 4 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCompareModal(true)}>
                ⚖️ Compare ({selectedIds.length})
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={exportSelectedCsv}>
              📥 Export CSV
            </button>
            {canWrite && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAdvanceModal(true)}>
                  Advance Lines
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowArchiveConfirm(true)}>
                  Archive
                </button>
                <button className="btn btn-secondary btn-sm" style={{ color: 'var(--status-danger)' }} onClick={() => setShowDeleteConfirm(true)}>
                  Delete
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds([])}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 'var(--space-6)' }}>
        <div>
          {isLoading ? (
            <div className="loading-spinner"><div className="spinner" /> Loading germplasm…</div>
          ) : filteredResults.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🌱</div>
              <p>No germplasm entries found matching the filter criteria.</p>
            </div>
          ) : viewMode === 'table' ? (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input 
                        type="checkbox"
                        checked={filteredResults.length > 0 && selectedIds.length === filteredResults.length}
                        onChange={e => setSelectedIds(e.target.checked ? filteredResults.map(r => r.id) : [])}
                      />
                    </th>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Gen</th>
                    <th>Type</th>
                    <th>Program</th>
                    <th>Tags</th>
                    <th style={{ width: 110 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map(entry => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelected(prev => prev?.id === entry.id ? null : entry)}
                      style={{ cursor: 'pointer' }}
                      className={selected?.id === entry.id ? 'selected-row' : ''}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(entry.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedIds(prev => [...prev, entry.id])
                            else setSelectedIds(prev => prev.filter(id => id !== entry.id))
                          }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <strong>{entry.name}</strong>
                          {entry.is_check && <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 4px' }}>CHECK</span>}
                        </div>
                      </td>
                      <td className="font-mono text-xs text-muted">{entry.germplasm_db_id}</td>
                      <td><span className="badge badge-blue">{GEN_LABELS[entry.generation] ?? `F${entry.generation}`}</span></td>
                      <td><CrossTypeBadge type={entry.cross_type} /></td>
                      <td className="text-sm text-muted">{entry.program_name}</td>
                      <td>
                        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                          {(entry.tags || []).slice(0, 2).map(t => (
                            <span key={t} className="badge badge-gray" style={{ fontSize: '0.65rem' }}>{t}</span>
                          ))}
                        </div>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-ghost btn-sm"
                            title="View Pedigree Tree"
                            onClick={() => setTreeTarget(entry)}
                          >
                            🌳
                          </button>
                          {canWrite && (
                            <>
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
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Card Grid View */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
              {filteredResults.map(entry => (
                <div
                  key={entry.id}
                  className={`card hover-row ${selected?.id === entry.id ? 'selected-row' : ''}`}
                  style={{ cursor: 'pointer', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                  onClick={() => setSelected(prev => prev?.id === entry.id ? null : entry)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(entry.id)}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          if (e.target.checked) setSelectedIds(prev => [...prev, entry.id])
                          else setSelectedIds(prev => prev.filter(id => id !== entry.id))
                        }}
                      />
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{entry.name}</div>
                    </div>
                    {entry.is_check && <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>CHECK</span>}
                  </div>
                  <div className="font-mono text-xs text-muted">{entry.germplasm_db_id}</div>
                  <div className="flex gap-2 text-xs">
                    <span className="badge badge-blue">{GEN_LABELS[entry.generation] ?? `F${entry.generation}`}</span>
                    <CrossTypeBadge type={entry.cross_type} />
                  </div>
                  <div className="text-xs text-muted">{entry.program_name}</div>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex gap-1" style={{ flexWrap: 'wrap', marginTop: 2 }}>
                      {entry.tags.map(t => <span key={t} className="badge badge-gray" style={{ fontSize: '0.65rem' }}>{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <PedigreePanel 
            entry={selected} 
            onOpenTree={(entry) => setTreeTarget(entry)} 
          />
        )}
      </div>

      {/* Modals */}
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

      {showCompareModal && (
        <ComparisonModal
          entries={selectedEntries}
          onClose={() => setShowCompareModal(false)}
        />
      )}

      {deleteEntry && (
        <ConfirmDialog
          message={`Delete "${deleteEntry.name}"? This cannot be undone.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteEntry(null)}
        />
      )}

      {showArchiveConfirm && (
        <ConfirmDialog
          message={`Archive ${selectedIds.length} accessions?`}
          loading={bulkArchiveMutation.isPending}
          onConfirm={() => bulkArchiveMutation.mutate()}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Permanently delete ${selectedIds.length} accessions? This cannot be undone.`}
          loading={bulkDeleteMutation.isPending}
          onConfirm={() => bulkDeleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showAdvanceModal && (
        <Modal title={`Advance ${selectedIds.length} Lines`} onClose={() => setShowAdvanceModal(false)}>
          <form onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            advanceMutation.mutate({ method: fd.get('method') as string, ssdCount: Number(fd.get('ssdCount')) })
          }}>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select name="method" className="form-input" defaultValue="bulk" onChange={e => {
                const countInput = document.getElementById('ssd-count-input') as HTMLInputElement
                if (countInput) countInput.disabled = e.target.value !== 'ssd'
              }}>
                <option value="bulk">Bulk (1 progeny per line)</option>
                <option value="ssd">Single-Seed-Descent (N progeny per line)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Number of Progeny (for SSD)</label>
              <input id="ssd-count-input" type="number" name="ssdCount" className="form-input" defaultValue="1" min="1" disabled />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdvanceModal(false)} disabled={advanceMutation.isPending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={advanceMutation.isPending}>
                {advanceMutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Advancing…</> : 'Advance Generation'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showAdvanceSuccessPrompt && (
        <Modal title="Success!" onClose={() => setShowAdvanceSuccessPrompt(false)}>
          <p>Successfully advanced and created {advancedIds.length} new lines.</p>
          <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={() => setShowAdvanceSuccessPrompt(false)}>Close</button>
            <button className="btn btn-primary" onClick={() => {
              setShowAdvanceSuccessPrompt(false)
              setShowSendToTrialModal(true)
            }}>Send to New Field</button>
          </div>
        </Modal>
      )}

      {showSendToTrialModal && (
        <SendToTrialModal
          germplasmIds={advancedIds}
          onClose={() => setShowSendToTrialModal(false)}
          onSuccess={(trialId) => {
            setShowSendToTrialModal(false)
            window.location.href = `/trials/${trialId}`
          }}
        />
      )}

      {treeTarget && (
        <PedigreeTreeModal
          germplasmId={treeTarget.id}
          germplasmName={treeTarget.name}
          onClose={() => setTreeTarget(null)}
          onSelectGermplasm={(id) => {
            const match = data?.results.find(r => r.id === id)
            if (match) setSelected(match)
          }}
        />
      )}
    </div>
  )
}

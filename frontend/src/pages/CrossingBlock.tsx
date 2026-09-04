import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  crossingBlocks, germplasm, programs, locations, seasons,
  CrossingBlock as CB, CrossEntry, CrossingMapEntry,
  Germplasm, Program, Location, Season, ApiError,
} from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

// ---- Map pattern labels -----------------------------------------------------
const MAP_PATTERNS: { value: string; label: string }[] = [
  { value: 'male_first', label: 'Common male → females' },
  { value: 'female_first', label: 'Common female → males' },
  { value: 'alternating', label: 'Alternating' },
]
const STATUS_COLORS: Record<string, string> = {
  planned: 'badge-gray', pollinated: 'badge-amber',
  harvested: 'badge-green', failed: 'badge-red',
}

// ---- Germplasm picker panel -------------------------------------------------
function GermplasmPanel({
  title, icon, selected, onToggle, searchTerm, onSearchChange, programFilter, entries, loading,
}: {
  title: string; icon: string; selected: Set<number>; onToggle: (id: number) => void
  searchTerm: string; onSearchChange: (v: string) => void
  programFilter: string
  entries: Germplasm[]; loading: boolean
}) {
  const filtered = useMemo(() => {
    const s = searchTerm.toLowerCase()
    return entries.filter(e =>
      (!s || e.name.toLowerCase().includes(s) || e.germplasm_db_id.toLowerCase().includes(s)) &&
      (!programFilter || e.program === Number(programFilter))
    )
  }, [entries, searchTerm, programFilter])



  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: '1.2rem' }}>{icon}</span> {title}
        <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>{selected.size} selected</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input type="search" placeholder="Search..." value={searchTerm} onChange={e => onSearchChange(e.target.value)} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-4)' }}>
            <p className="text-sm text-muted">No germplasm found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filtered.map(entry => (
              <label
                key={entry.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  padding: '6px var(--space-3)', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', transition: 'background 0.15s',
                  background: selected.has(entry.id) ? 'rgba(74, 222, 128, 0.08)' : 'transparent',
                }}
                className="hover-row"
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => onToggle(entry.id)}
                  style={{ accentColor: 'var(--brand-400)' }}
                />
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{entry.name}</span>
                <span className="text-xs text-muted font-mono" style={{ marginLeft: 'auto' }}>{entry.germplasm_db_id}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Cross preview row ------------------------------------------------------
function crossPreviewName(fName: string, mName: string) {
  return `${fName}/${mName}`
}

// ---- Create/Edit block modal ------------------------------------------------
function BlockFormModal({
  programList, locationList, seasonList,
  initial, onClose, onSaved,
}: {
  programList: Program[]; locationList: Location[]; seasonList: Season[]
  initial?: Partial<CB>; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    program: initial?.program?.toString() ?? (programList[0]?.id?.toString() ?? ''),
    location: initial?.location?.toString() ?? '',
    season: initial?.season?.toString() ?? '',
    map_pattern: initial?.map_pattern ?? 'male_first',
    include_reciprocals: initial?.include_reciprocals ?? false,
    notes: initial?.notes ?? '',
  })
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        program: Number(form.program),
        map_pattern: form.map_pattern,
        include_reciprocals: form.include_reciprocals,
        notes: form.notes,
      }
      if (form.location) payload.location = Number(form.location)
      if (form.season) payload.season = Number(form.season)
      return initial?.id
        ? crossingBlocks.update(initial.id, payload)
        : crossingBlocks.create(payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crossing-blocks'] }); onSaved(); onClose() },
    onError: (err) => {
      setError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
    },
  })

  return (
    <>
      {error && <div className="alert alert-error mb-4"><span>⚠</span><span>{error}</span></div>}
      <div className="form-grid">
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input id="cb-name" className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring 2026 Crosses" />
        </div>
        <div className="form-group">
          <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select id="cb-program" className="form-input" value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))}>
            {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <select id="cb-location" className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
            <option value="">— None —</option>
            {locationList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Season</label>
          <select id="cb-season" className="form-input" value={form.season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))}>
            <option value="">— None —</option>
            {seasonList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Map Pattern</label>
          <select id="cb-pattern" className="form-input" value={form.map_pattern} onChange={e => setForm(f => ({ ...f, map_pattern: e.target.value as 'male_first' | 'female_first' | 'alternating' }))}>
            {MAP_PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input id="cb-reciprocals" type="checkbox" checked={form.include_reciprocals} onChange={e => setForm(f => ({ ...f, include_reciprocals: e.target.checked }))} style={{ accentColor: 'var(--brand-400)' }} />
          <label htmlFor="cb-reciprocals" className="form-label" style={{ marginBottom: 0 }}>Include reciprocal crosses</label>
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Notes</label>
          <textarea id="cb-notes" className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button id="cb-save-btn" className="btn btn-primary"
          onClick={() => { if (!form.name || !form.program) { setError('Name and Program are required.'); return }; mutation.mutate() }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (initial?.id ? 'Save Changes' : 'Create Block')}
        </button>
      </div>
    </>
  )
}

// ---- Main page ==============================================================
export default function CrossingBlockPage() {
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'
  const qc = useQueryClient()

  // State
  const [showCreate, setShowCreate] = useState(false)
  const [activeBlock, setActiveBlock] = useState<CB | null>(null)
  const [deleteBlock, setDeleteBlock] = useState<CB | null>(null)

  // Parent selection state
  const [femaleSelected, setFemaleSelected] = useState<Set<number>>(new Set())
  const [maleSelected, setMaleSelected] = useState<Set<number>>(new Set())
  const [femaleSearch, setFemaleSearch] = useState('')
  const [maleSearch, setMaleSearch] = useState('')
  const [femaleProgramFilter] = useState('')
  const [maleProgramFilter] = useState('')

  // Cross preview and map
  const [plannedCrosses, setPlannedCrosses] = useState<CrossEntry[]>([])
  const [mapEntries, setMapEntries] = useState<CrossingMapEntry[]>([])
  const [executionResult, setExecutionResult] = useState<{ executed_count: number; progeny: { id: number; name: string }[] } | null>(null)

  // Queries
  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ['crossing-blocks'],
    queryFn: () => crossingBlocks.list(),
  })
  const { data: germplasmData, isLoading: germplasmLoading } = useQuery({
    queryKey: ['germplasm-all-crosses'],
    queryFn: () => germplasm.listAll(),
    enabled: !!activeBlock,
  })
  const { data: programsData } = useQuery({ queryKey: ['programs'], queryFn: () => programs.list() })
  const { data: locationsData } = useQuery({ queryKey: ['locations'], queryFn: () => locations.list() })
  const { data: seasonsData } = useQuery({ queryKey: ['seasons'], queryFn: () => seasons.list() })

  const programList = programsData?.results ?? []
  const locationList = locationsData?.results ?? []
  const seasonList = seasonsData?.results ?? []
  const allGermplasm = germplasmData?.results ?? []

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => crossingBlocks.destroy(deleteBlock!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crossing-blocks'] })
      setDeleteBlock(null)
      if (activeBlock?.id === deleteBlock?.id) { setActiveBlock(null); setPlannedCrosses([]); setMapEntries([]) }
    },
  })

  // Plan crosses mutation
  const planMutation = useMutation({
    mutationFn: () =>
      crossingBlocks.planCrosses(activeBlock!.id, {
        female_ids: [...femaleSelected],
        male_ids: [...maleSelected],
      }),
    onSuccess: (data) => {
      setPlannedCrosses(data.crosses)
      qc.invalidateQueries({ queryKey: ['crossing-blocks'] })
      // Load map
      crossingBlocks.getCrossingMap(activeBlock!.id).then(r => setMapEntries(r.map))
    },
  })

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: () => crossingBlocks.executeAll(activeBlock!.id),
    onSuccess: (data) => {
      setExecutionResult(data)
      qc.invalidateQueries({ queryKey: ['crossing-blocks'] })
      qc.invalidateQueries({ queryKey: ['germplasm'] })
      // Reload block detail
      crossingBlocks.detail(activeBlock!.id).then(b => {
        setActiveBlock(b)
        setPlannedCrosses(b.crosses ?? [])
      })
    },
  })

  // Helpers
  function toggleFemale(id: number) {
    setFemaleSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleMale(id: number) {
    setMaleSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function swapSelections() {
    const tempF = new Set(femaleSelected)
    setFemaleSelected(new Set(maleSelected))
    setMaleSelected(tempF)
  }

  // Client-side cross preview
  const crossPreview = useMemo(() => {
    if (!activeBlock) return []
    const femaleEntries = allGermplasm.filter(g => femaleSelected.has(g.id))
    const maleEntries = allGermplasm.filter(g => maleSelected.has(g.id))
    const pairs: { female: Germplasm; male: Germplasm; reciprocal: boolean }[] = []
    for (const f of femaleEntries) {
      for (const m of maleEntries) {
        if (f.id !== m.id) pairs.push({ female: f, male: m, reciprocal: false })
      }
    }
    if (activeBlock.include_reciprocals) {
      for (const f of femaleEntries) {
        for (const m of maleEntries) {
          if (f.id !== m.id) pairs.push({ female: m, male: f, reciprocal: true })
        }
      }
    }
    return pairs
  }, [femaleSelected, maleSelected, allGermplasm, activeBlock])

  function selectBlock(block: CB) {
    setActiveBlock(block)
    setFemaleSelected(new Set())
    setMaleSelected(new Set())
    setPlannedCrosses([])
    setMapEntries([])
    setExecutionResult(null)
    // Load existing crosses if any
    crossingBlocks.detail(block.id).then(b => {
      if (b.crosses && b.crosses.length > 0) {
        setPlannedCrosses(b.crosses)
        crossingBlocks.getCrossingMap(block.id).then(r => setMapEntries(r.map))
      }
    })
  }

  // ---- Render ----------------------------------------------------------------
  return (
    <div className="page-shell">
      <TopBar
        title="Crossing Block"
        subtitle={activeBlock ? activeBlock.name : `${blocksData?.count ?? '…'} blocks`}
        actions={canWrite ? (
          <div className="flex gap-2">
            {activeBlock && (
              <button className="btn btn-secondary" onClick={() => { setActiveBlock(null); setPlannedCrosses([]); setMapEntries([]); setExecutionResult(null) }}>
                ← Back to List
              </button>
            )}
            <button id="create-block-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + New Crossing Block
            </button>
          </div>
        ) : undefined}
      />

      {/* ============== LIST VIEW ============== */}
      {!activeBlock && (
        <>
          {blocksLoading ? (
            <div className="loading-spinner"><div className="spinner" /> Loading crossing blocks…</div>
          ) : (blocksData?.results ?? []).length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✂️</div>
              <p>No crossing blocks yet.</p>
              {canWrite && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create your first block</button>}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Program</th>
                    <th>Location</th>
                    <th>Season</th>
                    <th>Pattern</th>
                    <th>Reciprocals</th>
                    <th>Crosses</th>
                    {canWrite && <th style={{ width: 80 }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(blocksData?.results ?? []).map(block => (
                    <tr key={block.id} onClick={() => selectBlock(block)} style={{ cursor: 'pointer' }}>
                      <td><strong>{block.name}</strong></td>
                      <td className="text-sm text-muted">{block.program_name}</td>
                      <td className="text-sm text-muted">{block.location_name ?? '—'}</td>
                      <td className="text-sm text-muted">{block.season_name ?? '—'}</td>
                      <td><span className="badge badge-blue">{MAP_PATTERNS.find(p => p.value === block.map_pattern)?.label ?? block.map_pattern}</span></td>
                      <td>{block.include_reciprocals ? <span className="badge badge-amber">Yes</span> : <span className="badge badge-gray">No</span>}</td>
                      <td className="text-sm">{block.cross_count}</td>
                      {canWrite && (
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: 'var(--status-danger)' }} onClick={() => setDeleteBlock(block)}>🗑</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ============== DETAIL VIEW ============== */}
      {activeBlock && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* Block info bar */}
          <div className="card" style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <span className="text-xs text-muted">Program</span>
              <div className="text-sm" style={{ fontWeight: 600 }}>{activeBlock.program_name}</div>
            </div>
            <div>
              <span className="text-xs text-muted">Pattern</span>
              <div><span className="badge badge-blue">{MAP_PATTERNS.find(p => p.value === activeBlock.map_pattern)?.label}</span></div>
            </div>
            <div>
              <span className="text-xs text-muted">Reciprocals</span>
              <div>{activeBlock.include_reciprocals ? <span className="badge badge-amber">Enabled</span> : <span className="badge badge-gray">Disabled</span>}</div>
            </div>
            {activeBlock.location_name && (
              <div>
                <span className="text-xs text-muted">Location</span>
                <div className="text-sm">{activeBlock.location_name}</div>
              </div>
            )}
          </div>

          {/* Dual panel germplasm selectors */}
          {plannedCrosses.length === 0 && (
            <>
              <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'stretch' }}>
                <GermplasmPanel
                  title="Female Parents (♀)" icon="♀" selected={femaleSelected} onToggle={toggleFemale}
                  searchTerm={femaleSearch} onSearchChange={setFemaleSearch}
                  programFilter={femaleProgramFilter}
                  entries={allGermplasm} loading={germplasmLoading}
                />
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--space-2)' }}>
                  <button className="btn btn-secondary btn-sm" onClick={swapSelections} title="Swap ♀ ↔ ♂"
                    style={{ fontSize: '1.2rem', padding: 'var(--space-2) var(--space-3)' }}>
                    ⇄
                  </button>
                </div>
                <GermplasmPanel
                  title="Male Parents (♂)" icon="♂" selected={maleSelected} onToggle={toggleMale}
                  searchTerm={maleSearch} onSearchChange={setMaleSearch}
                  programFilter={maleProgramFilter}
                  entries={allGermplasm} loading={germplasmLoading}
                />
              </div>

              {/* Cross preview */}
              {crossPreview.length > 0 && (
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
                    Cross Preview — {crossPreview.length} crosses
                    {activeBlock.include_reciprocals && (
                      <span className="text-xs text-muted" style={{ marginLeft: 'var(--space-2)' }}>
                        (incl. {crossPreview.filter(c => c.reciprocal).length} reciprocals)
                      </span>
                    )}
                  </div>
                  <div className="table-container" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}>#</th>
                          <th>♀ Female</th>
                          <th>♂ Male</th>
                          <th>Progeny Name</th>
                          <th style={{ width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {crossPreview.map((pair, idx) => (
                          <tr key={idx}>
                            <td className="text-sm text-muted">{idx + 1}</td>
                            <td><strong>{pair.female.name}</strong></td>
                            <td><strong>{pair.male.name}</strong></td>
                            <td className="font-mono text-sm" style={{ color: 'var(--brand-300)' }}>{crossPreviewName(pair.female.name, pair.male.name)}</td>
                            <td>{pair.reciprocal && <span className="badge badge-amber">R</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="modal-footer" style={{ justifyContent: 'flex-end', paddingTop: 'var(--space-4)' }}>
                    <button
                      id="plan-crosses-btn"
                      className="btn btn-primary"
                      disabled={planMutation.isPending}
                      onClick={() => planMutation.mutate()}
                    >
                      {planMutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Planning…</> : `Save ${crossPreview.length} Crosses`}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Planned crosses table (after saving) */}
          {plannedCrosses.length > 0 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                Planned Crosses — {plannedCrosses.length}
                {executionResult && (
                  <span className="badge badge-green" style={{ marginLeft: 'auto' }}>
                    ✓ {executionResult.executed_count} progeny created
                  </span>
                )}
              </div>
              <div className="table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>Pos</th>
                      <th>Code</th>
                      <th>♀ Female</th>
                      <th>♂ Male</th>
                      <th>Progeny</th>
                      <th>Status</th>
                      <th style={{ width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plannedCrosses.sort((a, b) => (a.map_position ?? 0) - (b.map_position ?? 0)).map(cross => (
                      <tr key={cross.id}>
                        <td className="text-sm text-muted">{cross.map_position ?? '—'}</td>
                        <td className="font-mono text-sm">{cross.cross_code}</td>
                        <td><strong>{cross.female_parent_name}</strong></td>
                        <td><strong>{cross.male_parent_name}</strong></td>
                        <td className="font-mono text-sm" style={{ color: cross.progeny_name ? 'var(--brand-300)' : 'var(--text-muted)' }}>
                          {cross.progeny_name ?? crossPreviewName(cross.female_parent_name, cross.male_parent_name)}
                        </td>
                        <td><span className={`badge ${STATUS_COLORS[cross.status] ?? 'badge-gray'}`}>{cross.status}</span></td>
                        <td>{cross.is_reciprocal && <span className="badge badge-amber">R</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-footer" style={{ justifyContent: 'flex-end', paddingTop: 'var(--space-4)', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => crossingBlocks.exportMap(activeBlock.id)}
                >
                  ⬇ Export Map CSV
                </button>
                {!executionResult && (
                  <button
                    id="execute-crosses-btn"
                    className="btn btn-primary"
                    disabled={executeMutation.isPending}
                    onClick={() => executeMutation.mutate()}
                  >
                    {executeMutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Executing…</> : `Execute All Crosses`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Crossing map visualization */}
          {mapEntries.length > 0 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
                Crossing Map — {MAP_PATTERNS.find(p => p.value === activeBlock.map_pattern)?.label}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', padding: 'var(--space-2) 0' }}>
                {mapEntries.map(entry => (
                  <div
                    key={entry.position}
                    style={{
                      minWidth: 120,
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      border: '1px solid',
                      borderColor: entry.type === 'parent' ? 'var(--brand-400)' : 'var(--border-subtle)',
                      background: entry.type === 'parent'
                        ? 'linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(96, 165, 250, 0.05))'
                        : 'linear-gradient(135deg, rgba(74, 222, 128, 0.10), rgba(74, 222, 128, 0.03))',
                      flexShrink: 0,
                    }}
                  >
                    <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Pos {entry.position}</div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', wordBreak: 'break-word' }}>
                      {entry.entry_name}
                    </div>
                    {entry.cross_code && (
                      <div className="font-mono text-xs text-muted" style={{ marginTop: 4 }}>{entry.cross_code}</div>
                    )}
                    <div style={{ marginTop: 4 }}>
                      <span className={`badge ${entry.type === 'parent' ? 'badge-blue' : 'badge-green'}`} style={{ fontSize: '0.65rem' }}>
                        {entry.type === 'parent' ? 'Pollen' : 'Cross'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution result summary */}
          {executionResult && (
            <div className="alert alert-success">
              <span>✓</span>
              <span>
                Successfully created <strong>{executionResult.executed_count}</strong> progeny entries.
                New lines are now available in the Germplasm Browser.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <Modal title="New Crossing Block" onClose={() => setShowCreate(false)}>
          <BlockFormModal
            programList={programList} locationList={locationList} seasonList={seasonList}
            onClose={() => setShowCreate(false)} onSaved={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {deleteBlock && (
        <ConfirmDialog
          message={`Delete crossing block "${deleteBlock.name}"? All associated crosses will be deleted.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteBlock(null)}
        />
      )}
    </div>
  )
}

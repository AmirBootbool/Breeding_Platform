import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  trials, programs, locations, seasons,
  Trial, ApiError
} from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { DesignBadge } from '../components/trials/types'
import TrialDetail from '../components/trials/TrialDetail'
import TrialFormModal from '../components/trials/TrialFormModal'

const STATUS_META: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',    color: 'var(--status-success)' },
  completed: { label: 'Completed', color: 'var(--brand-400)' },
  archived:  { label: 'Archived',  color: 'var(--text-muted)' },
}

const GEN_LABELS: Record<number, string> = {
  0: 'F0', 1: 'F1', 2: 'F2', 3: 'F3', 4: 'F4',
  5: 'F5', 6: 'F6', 7: 'F7', 8: 'F8+',
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'var(--text-muted)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px',
      borderRadius: 20, border: `1px solid ${meta.color}22`,
      color: meta.color, background: `${meta.color}18`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
      {meta.label}
    </span>
  )
}

function TrialCard({ trial, canWrite, onClick, onEdit, onDelete, onClone }: {
  trial: Trial; canWrite: boolean
  onClick: () => void; onEdit: () => void; onDelete: () => void; onClone: () => void
}) {
  return (
    <div className="card fade-in" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <code style={{ color: 'var(--brand-300)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{trial.trial_code}</code>
          {trial.generation != null && (
            <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {GEN_LABELS[trial.generation] ?? `F${trial.generation}`}
            </span>
          )}
        </div>
        <StatusBadge status={trial.status} />
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{trial.name}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        <span>📍 {trial.location_name}</span>
        <span>🗓 {trial.season_name}</span>
        <span>🌾 {trial.program_name}</span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <DesignBadge type={trial.design_type} />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{trial.num_reps} rep{trial.num_reps !== 1 ? 's' : ''}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{trial.plot_count} plots</span>
      </div>
      {canWrite && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}
          onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" title="Edit" onClick={onEdit}>✏</button>
          <button className="btn btn-ghost btn-sm" title="Clone" onClick={onClone}>⎘</button>
          <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: 'var(--status-danger)' }} onClick={onDelete}>🗑</button>
        </div>
      )}
    </div>
  )
}

export default function TrialManager() {
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [search, setSearch]                 = useState('')
  const [filterProgram, setFilterProgram]   = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterSeason, setFilterSeason]     = useState('')
  const [filterDesign, setFilterDesign]     = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterGen, setFilterGen]           = useState('')
  const [viewMode, setViewMode]             = useState<'table' | 'card'>('table')

  const [selectedTrial, setSelectedTrial] = useState<Trial | null>(null)
  const [showCreate, setShowCreate]       = useState(false)
  const [editTrial, setEditTrial]         = useState<Trial | null>(null)
  const [deleteTrial, setDeleteTrial]     = useState<Trial | null>(null)
  const [cloneTrial, setCloneTrial]       = useState<Trial | null>(null)

  const qc = useQueryClient()

  const params = [
    search         ? `&search=${encodeURIComponent(search)}` : '',
    filterProgram  ? `&program=${filterProgram}` : '',
    filterLocation ? `&location=${filterLocation}` : '',
    filterSeason   ? `&season=${filterSeason}` : '',
    filterDesign   ? `&design_type=${filterDesign}` : '',
    filterStatus   ? `&status=${filterStatus}` : '',
    filterGen      ? `&generation=${filterGen}` : '',
  ].join('')

  const { data, isLoading } = useQuery({
    queryKey: ['trials', params],
    queryFn: () => trials.list(params),
    placeholderData: prev => prev,
  })

  const { data: programsData } = useQuery({ queryKey: ['programs'], queryFn: () => programs.list() })
  const { data: locationsData } = useQuery({ queryKey: ['locations-all'], queryFn: () => locations.list() })
  const { data: seasonsData }   = useQuery({ queryKey: ['seasons-all'], queryFn: () => seasons.list() })

  const programList  = programsData?.results ?? []
  const locationList = locationsData?.results ?? []
  const seasonList   = seasonsData?.results ?? []

  const deleteMutation = useMutation({
    mutationFn: () => trials.destroy(deleteTrial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      setDeleteTrial(null)
      if (selectedTrial?.id === deleteTrial?.id) setSelectedTrial(null)
    },
    onError: (err) => alert(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message),
  })

  const cloneMutation = useMutation({
    mutationFn: (t: Trial) => trials.create({
      name: `${t.name} (Copy)`,
      trial_code: `${t.trial_code}-COPY`,
      program: t.program, location: t.location, season: t.season,
      design_type: t.design_type, num_reps: t.num_reps,
      block_size: t.block_size, prep_fraction: t.prep_fraction,
      notes: t.notes, status: 'active',
      generation: t.generation,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      setCloneTrial(null)
    },
    onError: (err) => alert(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message),
  })

  const activeFilters = [filterProgram, filterLocation, filterSeason, filterDesign, filterStatus, filterGen].filter(Boolean).length

  if (selectedTrial) {
    return (
      <div className="page-shell">
        <TopBar
          title={selectedTrial.name}
          subtitle={`${selectedTrial.trial_code} — ${selectedTrial.location_name} (${selectedTrial.season_name})`}
          actions={
            <button className="btn btn-secondary" onClick={() => setSelectedTrial(null)}>
              ← Back to Trials
            </button>
          }
        />
        <TrialDetail key={selectedTrial.id} trial={selectedTrial} />
      </div>
    )
  }

  return (
    <div className="page-shell">
      <TopBar
        title="Trial Manager"
        subtitle={`${data?.count ?? '…'} trials`}
        actions={canWrite ? (
          <button id="new-trial-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New Trial
          </button>
        ) : undefined}
      />

      {/* Toolbar */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div className="search-bar" style={{ flex: '1 1 220px', minWidth: 180 }}>
          <span className="search-icon">🔍</span>
          <input
            id="trial-search" type="search"
            placeholder="Search trial code or name…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="select-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ flex: '0 0 130px' }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>

        <select className="select-input" value={filterProgram} onChange={e => setFilterProgram(e.target.value)} style={{ flex: '0 0 160px' }}>
          <option value="">All programs</option>
          {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select className="select-input" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={{ flex: '0 0 160px' }}>
          <option value="">All locations</option>
          {locationList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select className="select-input" value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{ flex: '0 0 160px' }}>
          <option value="">All seasons</option>
          {seasonList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select className="select-input" value={filterDesign} onChange={e => setFilterDesign(e.target.value)} style={{ flex: '0 0 150px' }}>
          <option value="">All designs</option>
          {['RCBD','alpha_lattice','augmented','prep','latin_square','augmented_block','unreplicated','other'].map(d =>
            <option key={d} value={d}>{d}</option>
          )}
        </select>

        <select className="select-input" value={filterGen} onChange={e => setFilterGen(e.target.value)} style={{ flex: '0 0 110px' }}>
          <option value="">All gen.</option>
          {Object.entries(GEN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {activeFilters > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setFilterProgram(''); setFilterLocation(''); setFilterSeason('')
            setFilterDesign(''); setFilterStatus(''); setFilterGen('')
          }}>
            ✕ Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
          </button>
        )}

        {/* View mode toggle */}
        <div style={{ display: 'flex', gap: 4, border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 2, marginLeft: 'auto' }}>
          <button
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('table')} title="Table view"
          >☰</button>
          <button
            className={`btn btn-sm ${viewMode === 'card' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('card')} title="Card view"
          >⊞</button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading trials…</div>
      ) : data?.results.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧪</div>
          <p>No trials match the current filters.</p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid-3">
          {data?.results.map((t: Trial) => (
            <TrialCard
              key={t.id} trial={t} canWrite={canWrite}
              onClick={() => setSelectedTrial(t)}
              onEdit={() => setEditTrial(t)}
              onDelete={() => setDeleteTrial(t)}
              onClone={() => setCloneTrial(t)}
            />
          ))}
        </div>
      ) : (
        <div className="table-container mb-8">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th>Gen.</th>
                <th>Program</th>
                <th>Location</th>
                <th>Season</th>
                <th>Design</th>
                <th>Reps</th>
                <th>Plots</th>
                {canWrite && <th style={{ width: 100 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.results.map((t: Trial) => (
                <tr key={t.id} onClick={() => setSelectedTrial(t)} style={{ cursor: 'pointer' }}>
                  <td><code className="font-mono text-sm" style={{ color: 'var(--brand-300)' }}>{t.trial_code}</code></td>
                  <td><strong>{t.name}</strong></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="text-sm text-muted">
                    {t.generation != null ? (GEN_LABELS[t.generation] ?? `F${t.generation}`) : '—'}
                  </td>
                  <td className="text-sm text-muted">{t.program_name}</td>
                  <td className="text-sm">{t.location_name}</td>
                  <td className="text-sm">{t.season_name}</td>
                  <td><DesignBadge type={t.design_type} /></td>
                  <td className="text-sm">{t.num_reps}</td>
                  <td className="text-sm">{t.plot_count}</td>
                  {canWrite && (
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <button id={`edit-trial-${t.id}`} className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEditTrial(t)}>✏</button>
                        <button id={`clone-trial-${t.id}`} className="btn btn-ghost btn-sm" title="Clone" onClick={() => setCloneTrial(t)}>⎘</button>
                        <button id={`delete-trial-${t.id}`} className="btn btn-ghost btn-sm" title="Delete" style={{ color: 'var(--status-danger)' }} onClick={() => setDeleteTrial(t)}>🗑</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Create Trial" onClose={() => setShowCreate(false)} wide>
          <TrialFormModal
            programList={programList} locationList={locationList} seasonList={seasonList}
            onClose={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editTrial && (
        <Modal title={`Edit — ${editTrial.trial_code}`} onClose={() => setEditTrial(null)} wide>
          <TrialFormModal
            initial={editTrial} programList={programList} locationList={locationList} seasonList={seasonList}
            onClose={() => setEditTrial(null)} isEdit editId={editTrial.id}
          />
        </Modal>
      )}

      {/* Clone confirm */}
      {cloneTrial && (
        <ConfirmDialog
          message={`Clone trial "${cloneTrial.trial_code}"? This creates a new trial with the same metadata but no plots or observations.`}
          loading={cloneMutation.isPending}
          onConfirm={() => cloneMutation.mutate(cloneTrial)}
          onCancel={() => setCloneTrial(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTrial && (
        <ConfirmDialog
          message={`Delete trial "${deleteTrial.trial_code}"? This will also delete all ${deleteTrial.plot_count} plots and all associated observations. This cannot be undone.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteTrial(null)}
        />
      )}
    </div>
  )
}

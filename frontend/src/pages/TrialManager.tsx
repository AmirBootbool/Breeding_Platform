import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar
} from 'recharts'
import {
  trials, plots, programs, locations, seasons,
  Trial, Plot, TrialSummaryRow, Program, Location, Season, ApiError
} from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

// ---- Color palette for plot grid ------------------------------------------
const PLOT_COLORS = [
  ['#1e4620', '#4ade80'],
  ['#1e3a5f', '#60a5fa'],
  ['#4a1942', '#e879f9'],
  ['#3b2a00', '#fbbf24'],
  ['#1a3040', '#38bdf8'],
  ['#3d1515', '#f87171'],
  ['#1f3d3d', '#34d399'],
  ['#2d2a00', '#facc15'],
]
function colorForIndex(i: number) { return PLOT_COLORS[i % PLOT_COLORS.length] }

// ---- Badges -----------------------------------------------------------------
function DesignBadge({ type }: { type: string }) {
  return <span className="badge badge-blue">{type}</span>
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    planned: 'badge-gray', planted: 'badge-amber',
    growing: 'badge-green', harvested: 'badge-blue',
  }
  return <span className={`badge ${map[status] ?? 'badge-gray'}`}>{status}</span>
}

// ---- Plot grid --------------------------------------------------------------
function PlotGrid({ plotList }: { plotList: Plot[] }) {
  const germplasmIds = [...new Set(plotList.map(p => p.germplasm))]
  const colorMap: Record<number, number> = {}
  germplasmIds.forEach((id, idx) => { colorMap[id] = idx })
  const cols = Math.min(Math.ceil(Math.sqrt(plotList.length)), 10)

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
        Plot Layout — {plotList.length} plots
      </div>
      <div className="plot-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {plotList.map(plot => {
          const [bg, fg] = colorForIndex(colorMap[plot.germplasm])
          return (
            <div key={plot.id} className="plot-cell" style={{ background: bg, color: fg }}
              title={`Plot ${plot.plot_number} | Rep ${plot.rep} | ${plot.germplasm_name}`}>
              <span className="plot-num">{plot.plot_number}</span>
              <span className="plot-germ">{plot.germplasm_name}</span>
              <StatusBadge status={plot.status} />
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
        {germplasmIds.map((id, idx) => {
          const name = plotList.find(p => p.germplasm === id)?.germplasm_name ?? String(id)
          const [bg, fg] = colorForIndex(idx)
          return (
            <div key={id} className="flex items-center gap-2" style={{ fontSize: '0.75rem' }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${fg}` }} />
              <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- Summary chart ----------------------------------------------------------
const CHART_COLOR = 'hsl(142, 52%, 44%)'

function SummaryChart({ rows }: { rows: TrialSummaryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <p>No numeric observations recorded yet.</p>
      </div>
    )
  }
  const chartData = rows.map(r => ({
    name: r.variable, mean: r.mean ?? 0, error: r.std_dev ?? 0,
    unit: r.unit, count: r.count,
  }))
  return (
    <div>
      <div className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Mean ± Std Dev per Trait</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
            formatter={(value: number, name: string, props: { payload?: { unit?: string } }) => {
              if (name === 'mean') return [`${value.toFixed(3)} ${props.payload?.unit ?? ''}`, 'Mean']
              return [value, name]
            }}
          />
          <Bar dataKey="mean" fill={CHART_COLOR} radius={[4, 4, 0, 0]}>
            <ErrorBar dataKey="error" width={4} strokeWidth={2} stroke="var(--amber-400)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="table-container mt-6">
        <table className="data-table">
          <thead><tr><th>Variable</th><th>Unit</th><th>N</th><th>Mean</th><th>Min</th><th>Max</th><th>SD</th><th>CV%</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.variable}>
                <td><strong>{r.variable}</strong></td>
                <td className="text-muted text-sm">{r.unit || '—'}</td>
                <td>{r.count}</td>
                <td className="font-mono">{r.mean?.toFixed(3) ?? '—'}</td>
                <td className="font-mono">{r.min ?? '—'}</td>
                <td className="font-mono">{r.max ?? '—'}</td>
                <td className="font-mono">{r.std_dev?.toFixed(3) ?? '—'}</td>
                <td className="font-mono">{r.cv_percent?.toFixed(1) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---- Trial detail -----------------------------------------------------------
function TrialDetail({ trial }: { trial: Trial }) {
  const [tab, setTab] = useState<'layout' | 'summary'>('layout')
  const qc = useQueryClient()

  const { data: plotData, isLoading: plotLoading } = useQuery({
    queryKey: ['plots', trial.id],
    queryFn: () => plots.list(`&trial=${trial.id}&page_size=500`),
  })

  const { data: summaryData } = useQuery({
    queryKey: ['trial-summary', trial.id],
    queryFn: () => trials.summary(trial.id),
  })

  const createPlotsMutation = useMutation({
    mutationFn: () => trials.createPlots(trial.id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plots', trial.id] }),
  })

  const plotList = plotData?.results ?? []

  return (
    <div className="fade-in">
      <div className="card mb-6">
        <div className="grid-4" style={{ gap: 'var(--space-5)' }}>
          <div><div className="card-title">Trial Code</div>
            <code className="font-mono" style={{ color: 'var(--brand-300)', fontSize: '1rem' }}>{trial.trial_code}</code></div>
          <div><div className="card-title">Design</div><DesignBadge type={trial.design_type} /></div>
          <div><div className="card-title">Location</div><span className="text-sm">{trial.location_name}</span></div>
          <div><div className="card-title">Season</div><span className="text-sm">{trial.season_name}</span></div>
          <div><div className="card-title">Replications</div><span className="text-sm">{trial.num_reps}</span></div>
          <div><div className="card-title">Plots</div><span className="text-sm">{trial.plot_count}</span></div>
          <div><div className="card-title">Program</div><span className="text-sm">{trial.program_name}</span></div>
          {trial.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="card-title">Notes</div>
              <span className="text-sm text-muted">{trial.notes}</span>
            </div>
          )}
        </div>
        {plotList.length === 0 && !plotLoading && (
          <div className="mt-6 flex items-center gap-4">
            <button id="create-plots-btn" className="btn btn-primary"
              onClick={() => createPlotsMutation.mutate()}
              disabled={createPlotsMutation.isPending}>
              {createPlotsMutation.isPending
                ? <><div className="spinner" /> Generating…</>
                : '⊞ Generate RCBD Layout'}
            </button>
          </div>
        )}
      </div>
      <div className="tab-bar">
        {(['layout', 'summary'] as const).map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'layout' ? '⊞ Plot Layout' : '📊 Summary'}
          </button>
        ))}
      </div>
      {tab === 'layout' && (
        plotLoading ? <div className="loading-spinner"><div className="spinner" /> Loading plots…</div>
          : plotList.length === 0
            ? <div className="empty-state"><div className="empty-icon">⊞</div><p>No plots yet.</p></div>
            : <div className="card"><PlotGrid plotList={plotList} /></div>
      )}
      {tab === 'summary' && (
        <div className="card"><SummaryChart rows={summaryData?.summary ?? []} /></div>
      )}
    </div>
  )
}

// ---- Trial Form ------------------------------------------------------------
const DESIGN_TYPES = ['RCBD', 'alpha_lattice', 'augmented', 'unreplicated', 'other']

interface TrialFormProps {
  initial?: Partial<Trial>
  programList: Program[]
  locationList: Location[]
  seasonList: Season[]
  onClose: () => void
  isEdit?: boolean
  editId?: number
}

function TrialForm({ initial, programList, locationList, seasonList, onClose, isEdit, editId }: TrialFormProps) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    trial_code: initial?.trial_code ?? '',
    program: initial?.program?.toString() ?? (programList[0]?.id?.toString() ?? ''),
    location: initial?.location?.toString() ?? (locationList[0]?.id?.toString() ?? ''),
    season: initial?.season?.toString() ?? '',
    design_type: initial?.design_type ?? 'RCBD',
    num_reps: initial?.num_reps?.toString() ?? '1',
    planting_date: initial?.planting_date ?? '',
    harvest_date: initial?.harvest_date ?? '',
    notes: initial?.notes ?? '',
  })
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const filteredSeasons = seasonList.filter(s => !form.program || s.program === Number(form.program))

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        trial_code: form.trial_code,
        program: Number(form.program),
        location: Number(form.location),
        season: Number(form.season),
        design_type: form.design_type,
        num_reps: Number(form.num_reps),
        notes: form.notes,
      }
      if (form.planting_date) payload.planting_date = form.planting_date
      if (form.harvest_date) payload.harvest_date = form.harvest_date
      return isEdit && editId
        ? trials.update(editId, payload)
        : trials.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      qc.invalidateQueries({ queryKey: ['trials-all'] })
      qc.invalidateQueries({ queryKey: ['trials-export'] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
    },
  })

  function set(field: string, val: string) { setForm(prev => ({ ...prev, [field]: val })) }

  return (
    <>
      {error && <div className="alert alert-error mb-4"><span>⚠</span><span>{error}</span></div>}
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Trial Code <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input id="trial-code" className="form-input" value={form.trial_code} onChange={e => set('trial_code', e.target.value)} placeholder="e.g. YT-KANO-2026-02" />
        </div>
        <div className="form-group">
          <label className="form-label">Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input id="trial-name" className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Kano Yield Trial 2026" />
        </div>
        <div className="form-group">
          <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select id="trial-program" className="form-input" value={form.program}
            onChange={e => { set('program', e.target.value); set('season', '') }}>
            <option value="">— Choose —</option>
            {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Location <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select id="trial-location" className="form-input" value={form.location} onChange={e => set('location', e.target.value)}>
            <option value="">— Choose —</option>
            {locationList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Season <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select id="trial-season" className="form-input" value={form.season} onChange={e => set('season', e.target.value)}>
            <option value="">— Choose —</option>
            {filteredSeasons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Design Type</label>
          <select id="trial-design" className="form-input" value={form.design_type} onChange={e => set('design_type', e.target.value)}>
            {DESIGN_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Replications</label>
          <input id="trial-reps" className="form-input" type="number" min={1} value={form.num_reps} onChange={e => set('num_reps', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Planting Date</label>
          <input id="trial-planting" className="form-input" type="date" value={form.planting_date} onChange={e => set('planting_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Harvest Date</label>
          <input id="trial-harvest" className="form-input" type="date" value={form.harvest_date} onChange={e => set('harvest_date', e.target.value)} />
        </div>
        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Notes</label>
          <textarea id="trial-notes" className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button
          id="trial-save-btn"
          className="btn btn-primary"
          disabled={mutation.isPending}
          onClick={() => {
            if (!form.name || !form.trial_code || !form.program || !form.location || !form.season) {
              setError('Name, Code, Program, Location, and Season are required.')
              return
            }
            mutation.mutate()
          }}
        >
          {mutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (isEdit ? 'Save Changes' : 'Create Trial')}
        </button>
      </div>
    </>
  )
}

// ---- Main page --------------------------------------------------------------
export default function TrialManager() {
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [search, setSearch] = useState('')
  const [selectedTrial, setSelectedTrial] = useState<Trial | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editTrial, setEditTrial] = useState<Trial | null>(null)
  const [deleteTrial, setDeleteTrial] = useState<Trial | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['trials', search],
    queryFn: () => trials.list(search ? `&search=${encodeURIComponent(search)}` : ''),
    placeholderData: prev => prev,
  })

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
    enabled: showCreate || !!editTrial,
  })

  const { data: locationsData } = useQuery({
    queryKey: ['locations-all'],
    queryFn: () => locations.list(),
    enabled: showCreate || !!editTrial,
  })

  const { data: seasonsData } = useQuery({
    queryKey: ['seasons-all'],
    queryFn: () => seasons.list(),
    enabled: showCreate || !!editTrial,
  })

  const deleteMutation = useMutation({
    mutationFn: () => trials.destroy(deleteTrial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      setDeleteTrial(null)
      if (selectedTrial?.id === deleteTrial?.id) setSelectedTrial(null)
    },
  })

  const programList = programsData?.results ?? []
  const locationList = locationsData?.results ?? []
  const seasonList = seasonsData?.results ?? []

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

      <div className="toolbar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            id="trial-search"
            type="search"
            placeholder="Search trial code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading trials…</div>
      ) : (
        <>
          <div className="table-container mb-8">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Program</th>
                  <th>Location</th><th>Season</th><th>Design</th>
                  <th>Reps</th><th>Plots</th>
                  {canWrite && <th style={{ width: 80 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data?.results.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 9 : 8} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                      No trials found.
                    </td>
                  </tr>
                ) : data?.results.map(t => (
                  <tr key={t.id}
                    onClick={() => setSelectedTrial(prev => prev?.id === t.id ? null : t)}
                    style={{ cursor: 'pointer' }}
                    className={selectedTrial?.id === t.id ? 'selected-row' : ''}>
                    <td><code className="font-mono text-sm" style={{ color: 'var(--brand-300)' }}>{t.trial_code}</code></td>
                    <td><strong>{t.name}</strong></td>
                    <td className="text-sm text-muted">{t.program_name}</td>
                    <td className="text-sm">{t.location_name}</td>
                    <td className="text-sm">{t.season_name}</td>
                    <td><DesignBadge type={t.design_type} /></td>
                    <td className="text-sm">{t.num_reps}</td>
                    <td className="text-sm">{t.plot_count}</td>
                    {canWrite && (
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button id={`edit-trial-${t.id}`} className="btn btn-ghost btn-sm" title="Edit"
                            onClick={() => setEditTrial(t)}>✏</button>
                          <button id={`delete-trial-${t.id}`} className="btn btn-ghost btn-sm" title="Delete"
                            style={{ color: 'var(--status-danger)' }}
                            onClick={() => setDeleteTrial(t)}>🗑</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedTrial && (
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
                {selectedTrial.name}
              </h2>
              <TrialDetail trial={selectedTrial} />
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Create Trial" onClose={() => setShowCreate(false)} wide>
          <TrialForm
            programList={programList}
            locationList={locationList}
            seasonList={seasonList}
            onClose={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editTrial && (
        <Modal title={`Edit — ${editTrial.trial_code}`} onClose={() => setEditTrial(null)} wide>
          <TrialForm
            initial={editTrial}
            programList={programList}
            locationList={locationList}
            seasonList={seasonList}
            onClose={() => setEditTrial(null)}
            isEdit
            editId={editTrial.id}
          />
        </Modal>
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

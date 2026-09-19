import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { germplasm, maintenanceCycles, seasons, Germplasm, MaintenanceCycle, ApiError } from '../api/client'
import { Plus, Check, ShieldCheck } from 'lucide-react'

const METHOD_LABELS: Record<string, string> = {
  ear_to_row: 'Ear-to-Row / Head-Row Selection',
  nucleus_seed: 'Nucleus Seed System',
  mass_selection: 'Mass Selection',
  other: 'Other Method',
}

export default function GermplasmHistoryPanel({ entry }: { entry: Germplasm }) {
  const [showLogForm, setShowLogForm] = useState(false)
  const [formError, setFormError] = useState('')
  const qc = useQueryClient()

  const [form, setForm] = useState({
    method: 'ear_to_row' as MaintenanceCycle['method'],
    season: '',
    off_types_removed: '0',
    notes: '',
  })

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['germplasm-history', entry.id],
    queryFn: () => germplasm.getHistory(entry.id),
  })

  const { data: cyclesData } = useQuery({
    queryKey: ['maintenance-cycles', entry.id],
    queryFn: () => maintenanceCycles.list(`&variety=${entry.id}`),
  })

  const { data: seasonsData } = useQuery({
    queryKey: ['seasons-all'],
    queryFn: () => seasons.list(),
  })

  const cycles = cyclesData?.results ?? []
  const seasonList = seasonsData?.results ?? []

  const logCycleMutation = useMutation({
    mutationFn: () => {
      const nextCycleNumber = cycles.length > 0
        ? Math.max(...cycles.map((c) => c.cycle_number)) + 1
        : 1

      const payload: Partial<MaintenanceCycle> = {
        variety: entry.id,
        cycle_number: nextCycleNumber,
        method: form.method,
        off_types_removed: form.off_types_removed !== '' ? Number(form.off_types_removed) : null,
        season: form.season ? Number(form.season) : null,
        notes: form.notes,
      }

      return maintenanceCycles.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-cycles', entry.id] })
      setShowLogForm(false)
      setFormError('')
      setForm({
        method: 'ear_to_row',
        season: '',
        off_types_removed: '0',
        notes: '',
      })
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
    },
  })

  if (historyLoading || !historyData) return null

  return (
    <div className="card" style={{ marginTop: 'var(--space-3)' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        Pedigree & Deployment History
        {historyData.is_shortlisted && <span className="badge badge-blue">★ Shortlisted ({historyData.shortlist_source})</span>}
      </div>

      <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Trials ({historyData.trial_history.length})</p>
      {historyData.trial_history.length === 0 ? (
        <p className="text-sm text-muted">Not yet placed in a trial.</p>
      ) : (
        <ul className="text-sm" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {historyData.trial_history.map((t, i) => (
            <li key={i}>{t.trial_code} — {t.season_name ?? '—'} @ {t.location_name ?? '—'} (plot {t.plot_number}, {t.status})</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted" style={{ marginTop: 'var(--space-3)' }}>Crosses ({historyData.cross_history.length})</p>
      {historyData.cross_history.length === 0 ? (
        <p className="text-sm text-muted">Not part of any recorded cross.</p>
      ) : (
        <ul className="text-sm" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {historyData.cross_history.map((c, i) => (
            <li key={i}>{c.cross_code} (as {c.role}, with {c.other_parent}) — {c.status}{c.progeny_name ? ` → ${c.progeny_name}` : ''}</li>
          ))}
        </ul>
      )}

      {/* Variety Maintenance & Breeder Seed Multiplication Cycles */}
      <div className="divider" style={{ margin: 'var(--space-4) 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        <div className="flex items-center gap-1">
          <ShieldCheck size={16} className="text-brand-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Variety Maintenance Cycles</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-xs flex items-center gap-1"
          onClick={() => setShowLogForm((v) => !v)}
          style={{ color: 'var(--brand-400)' }}
        >
          <Plus size={13} /> {showLogForm ? 'Cancel' : 'Log Cycle'}
        </button>
      </div>

      {showLogForm && (
        <div className="card mb-3" style={{ background: 'var(--bg-surface)', padding: 'var(--space-3)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold mb-2">Record Variety Maintenance / Breeder Seed Cycle</div>
          {formError && <div className="alert alert-error text-xs mb-2"><span>⚠</span><span>{formError}</span></div>}

          <div className="grid-2" style={{ gap: 'var(--space-2)', fontSize: '0.8rem' }}>
            <div>
              <label className="form-label text-xs">Method</label>
              <select
                className="form-input text-xs"
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as MaintenanceCycle['method'] })}
              >
                <option value="ear_to_row">Ear-to-Row / Head-Row Selection</option>
                <option value="nucleus_seed">Nucleus Seed System</option>
                <option value="mass_selection">Mass Selection</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="form-label text-xs">Season</label>
              <select
                className="form-input text-xs"
                value={form.season}
                onChange={(e) => setForm({ ...form, season: e.target.value })}
              >
                <option value="">— Optional Season —</option>
                {seasonList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label text-xs">Off-Types Removed</label>
              <input
                type="number"
                min={0}
                className="form-input text-xs"
                value={form.off_types_removed}
                onChange={(e) => setForm({ ...form, off_types_removed: e.target.value })}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label text-xs">Notes & Selection Criteria</label>
              <input
                type="text"
                className="form-input text-xs"
                placeholder="Rogueing notes, spike morphology inspection, lot storage…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              className="btn btn-secondary btn-sm text-xs"
              onClick={() => setShowLogForm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm text-xs flex items-center gap-1"
              disabled={logCycleMutation.isPending}
              onClick={() => logCycleMutation.mutate()}
            >
              {logCycleMutation.isPending ? 'Saving…' : <><Check size={12} /> Save Maintenance Record</>}
            </button>
          </div>
        </div>
      )}

      {cycles.length === 0 ? (
        <p className="text-xs text-muted" style={{ margin: 0 }}>No variety maintenance or purity cycles logged.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="hover-row"
              style={{
                padding: 'var(--space-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.78rem',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">
                  Cycle #{cycle.cycle_number} — {METHOD_LABELS[cycle.method] ?? cycle.method}
                </span>
                {cycle.season_name && (
                  <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                    {cycle.season_name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-1 text-muted text-xs">
                {cycle.off_types_removed != null && (
                  <span style={{ color: cycle.off_types_removed > 0 ? 'var(--status-danger)' : 'inherit' }}>
                    Off-types removed: {cycle.off_types_removed}
                  </span>
                )}
              </div>
              {cycle.notes && <div className="text-muted text-xs mt-1 italic">{cycle.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

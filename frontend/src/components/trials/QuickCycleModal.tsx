import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, Trial, Program, Location, Season, ApiError } from '../../api/client'
import { Zap } from 'lucide-react'

interface QuickCycleModalProps {
  programList: Program[]
  locationList: Location[]
  seasonList: Season[]
  onClose: () => void
  onCreated?: (trial: Trial) => void
}

export default function QuickCycleModal({
  programList,
  locationList,
  seasonList,
  onClose,
  onCreated,
}: QuickCycleModalProps) {
  const today = new Date().toISOString().split('T')[0]
  const defaultHarvest = new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [form, setForm] = useState({
    name: '',
    trial_code: `PHYTO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    program: programList[0]?.id?.toString() ?? '',
    location: locationList[0]?.id?.toString() ?? '',
    season: seasonList[0]?.id?.toString() ?? '',
    generation: '2', // default F2
    cycle_days: '65',
    planting_date: today,
    harvest_date: defaultHarvest,
    notes: 'Phytotron rapid-cycling generation advance',
  })
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        trial_code: form.trial_code.trim(),
        program: Number(form.program),
        location: Number(form.location),
        season: Number(form.season),
        design_type: 'unreplicated',
        num_reps: 1,
        purpose: 'phytotron_cycle',
        status: 'active',
        planting_date: form.planting_date || null,
        harvest_date: form.harvest_date || null,
        generation: form.generation !== '' ? Number(form.generation) : null,
        notes: form.notes,
      }
      return trials.create(payload)
    },
    onSuccess: (newTrial) => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      qc.invalidateQueries({ queryKey: ['trials-all'] })
      if (onCreated) onCreated(newTrial)
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
    },
  })

  function handleDaysChange(daysStr: string) {
    const days = parseInt(daysStr, 10)
    setForm((prev) => {
      const updated = { ...prev, cycle_days: daysStr }
      if (!isNaN(days) && prev.planting_date) {
        const plantD = new Date(prev.planting_date)
        const targetD = new Date(plantD.getTime() + days * 24 * 60 * 60 * 1000)
        updated.harvest_date = targetD.toISOString().split('T')[0]
      }
      return updated
    })
  }

  function set(field: string, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }))
  }

  return (
    <div className="quick-cycle-modal">
      <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--brand-400)' }}>
        <Zap size={22} />
        <h3 className="text-lg font-bold" style={{ margin: 0 }}>Rapid-Cycling / Phytotron Setup</h3>
      </div>
      <p className="text-xs text-muted mb-4">
        Quickly configure a controlled-environment or speed-breeding cycle with automated generation tracking and harvest turnaround timing.
      </p>

      {error && <div className="alert alert-error mb-4"><span>⚠</span><span>{error}</span></div>}

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Trial Code <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input
            id="quick-cycle-code"
            className="form-input font-mono"
            value={form.trial_code}
            onChange={(e) => set('trial_code', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cycle / Trial Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input
            id="quick-cycle-name"
            className="form-input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Speed Nursery Cycle 3"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select
            id="quick-cycle-program"
            className="form-input"
            value={form.program}
            onChange={(e) => set('program', e.target.value)}
          >
            {programList.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Facility / Location <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select
            id="quick-cycle-loc"
            className="form-input"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
          >
            {locationList.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Season <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select
            id="quick-cycle-season"
            className="form-input"
            value={form.season}
            onChange={(e) => set('season', e.target.value)}
          >
            {seasonList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Target Generation</label>
          <select
            id="quick-cycle-gen"
            className="form-input"
            value={form.generation}
            onChange={(e) => set('generation', e.target.value)}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
              <option key={g} value={g}>{['F0 (P)', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8+'][g]}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Cycle Duration (Days)</label>
          <input
            id="quick-cycle-duration"
            className="form-input"
            type="number"
            min={30}
            max={180}
            value={form.cycle_days}
            onChange={(e) => handleDaysChange(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Planting Date</label>
          <input
            id="quick-cycle-planting"
            className="form-input"
            type="date"
            value={form.planting_date}
            onChange={(e) => set('planting_date', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Est. Harvest / Maturity</label>
          <input
            id="quick-cycle-harvest"
            className="form-input"
            type="date"
            value={form.harvest_date}
            onChange={(e) => set('harvest_date', e.target.value)}
          />
        </div>

        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Notes & Photoperiod / Temp Settings</label>
          <textarea
            id="quick-cycle-notes"
            className="form-input"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
      </div>

      <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </button>
        <button
          id="create-quick-cycle-btn"
          className="btn btn-primary flex items-center gap-2"
          disabled={mutation.isPending}
          onClick={() => {
            if (!form.name || !form.trial_code || !form.program || !form.location || !form.season) {
              setError('Name, Code, Program, Location, and Season are required.')
              return
            }
            mutation.mutate()
          }}
        >
          {mutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : <><Zap size={15} /> Launch Cycle</>}
        </button>
      </div>
    </div>
  )
}

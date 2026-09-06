import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { programs, locations, seasons, trials, Program, Location, Season, ApiError } from '../api/client'
import Modal from './Modal'

interface SendToTrialModalProps {
  germplasmIds: number[]
  onClose: () => void
  onSuccess: (trialId: number) => void
}

const DESIGN_OPTIONS = [
  { value: 'RCBD', label: 'RCBD (Randomized Complete Block Design)', requiresReps: true },
  { value: 'unreplicated', label: 'Unreplicated (Head-to-Row Nursery)', requiresReps: false },
  { value: 'alpha_lattice', label: 'Alpha-Lattice (Incomplete Block)', requiresReps: true, requiresBlockSize: true },
  { value: 'augmented', label: 'Augmented Design (Entries + Replicated Checks)', requiresReps: true },
  { value: 'augmented_block', label: 'Augmented Incomplete Block', requiresReps: true, requiresBlockSize: true },
  { value: 'latin_square', label: 'Latin Square (Row-Column Grid)', requiresReps: false },
  { value: 'prep', label: 'P-Rep (Partially Replicated Design)', requiresReps: false, requiresPrepFraction: true },
  { value: 'other', label: 'Custom / Other', requiresReps: true },
]

export default function SendToTrialModal({ germplasmIds, onClose, onSuccess }: SendToTrialModalProps) {
  const qc = useQueryClient()
  
  const [form, setForm] = useState({
    name: '',
    trial_code: '',
    program: '',
    location: '',
    season: '',
    design_type: 'RCBD',
    num_reps: '2',
    block_size: '4',
    prep_fraction: '0.25',
    randomization_seed: '42',
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: programsData } = useQuery({ queryKey: ['programs'], queryFn: () => programs.list() })
  const { data: locationsData } = useQuery({ queryKey: ['locations'], queryFn: () => locations.list() })
  const { data: seasonsData } = useQuery({ queryKey: ['seasons'], queryFn: () => seasons.list() })

  const programList = programsData?.results ?? []
  const locationList = locationsData?.results ?? []
  const seasonList = seasonsData?.results ?? []

  // Auto-select program if only one or none selected
  useEffect(() => {
    if (!form.program && programList.length > 0) {
      setForm(prev => ({
        ...prev,
        program: programList[0].id.toString(),
      }))
    }
  }, [programList, form.program])

  // Filter seasons by program if program is selected
  const filteredSeasons = useMemo(() => {
    if (!form.program) return seasonList
    return seasonList.filter((s: Season) => !s.program || s.program === Number(form.program))
  }, [seasonList, form.program])

  const isAlpha = form.design_type === 'alpha_lattice' || form.design_type === 'augmented_block'
  const isLatinSquare = form.design_type === 'latin_square'
  const isPRep = form.design_type === 'prep'
  const isUnrep = form.design_type === 'unreplicated'

  // Expected total plots computation
  const estimatedPlots = useMemo(() => {
    const n = germplasmIds.length
    if (n === 0) return 0
    if (isUnrep) return n
    if (isLatinSquare) return n * n
    if (isPRep) {
      const frac = parseFloat(form.prep_fraction) || 0.25
      return Math.round(n * (1 + frac))
    }
    const reps = parseInt(form.num_reps, 10) || 1
    return n * reps
  }, [germplasmIds.length, isUnrep, isLatinSquare, isPRep, form.prep_fraction, form.num_reps])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.program) {
      setError('Field/Trial Name and Program are required.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      // 1. Prepare Trial Payload
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        program: Number(form.program),
        design_type: form.design_type,
      }

      if (form.trial_code.trim()) {
        payload.trial_code = form.trial_code.trim()
      }

      if (form.location) {
        payload.location = Number(form.location)
      }
      if (form.season) {
        payload.season = Number(form.season)
      }

      if (isLatinSquare) {
        payload.num_reps = 1
      } else if (isUnrep) {
        payload.num_reps = 1
      } else if (form.num_reps) {
        payload.num_reps = Number(form.num_reps) || 1
      }

      if (isAlpha && form.block_size) {
        payload.block_size = Number(form.block_size)
      }

      if (isPRep && form.prep_fraction) {
        payload.prep_fraction = Number(form.prep_fraction)
      }

      const newTrial = await trials.create(payload)

      // 2. Generate Plots with the selected germplasm
      await trials.createPlots(newTrial.id, {
        germplasm_ids: germplasmIds,
        seed: Number(form.randomization_seed) || 42,
      })

      qc.invalidateQueries({ queryKey: ['trials'] })
      qc.invalidateQueries({ queryKey: ['trials-all'] })
      onSuccess(newTrial.id)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(typeof err.detail === 'object' ? JSON.stringify(err.detail) : String(err.detail || 'Failed to create trial.'))
      } else {
        setError((err as Error).message)
      }
    }
 finally {
      setIsSubmitting(false)
    }
  }

  function set(field: string, val: string) {
    setForm(prev => ({ ...prev, [field]: val }))
  }

  return (
    <Modal title={`Send ${germplasmIds.length} Lines to New Field`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-error mb-4">
            <span>⚠</span><span>{error}</span>
          </div>
        )}

        <div className="alert alert-info mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span>🌱</span>
            <span> Selected Entries: <strong>{germplasmIds.length} lines</strong></span>
          </div>
          <span className="badge badge-blue">
            Estimated Plots: <strong>{estimatedPlots}</strong>
          </span>
        </div>

        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Field/Trial Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <input
              id="send-trial-name"
              className="form-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. F6-YIELD-TRIAL-2026"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Trial Code <span className="text-muted text-xs">(Auto-generated if empty)</span></label>
            <input
              id="send-trial-code"
              className="form-input"
              value={form.trial_code}
              onChange={e => set('trial_code', e.target.value)}
              placeholder="e.g. YT-2026-F6"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <select
              id="send-trial-program"
              className="form-input"
              value={form.program}
              onChange={e => {
                set('program', e.target.value)
                set('season', '')
              }}
              required
            >
              <option value="">— Select Program —</option>
              {programList.map((p: Program) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Location <span className="text-muted text-xs">(Optional)</span></label>
            <select id="send-trial-location" className="form-input" value={form.location} onChange={e => set('location', e.target.value)}>
              <option value="">— Select Location (or default) —</option>
              {locationList.map((l: Location) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Season <span className="text-muted text-xs">(Optional)</span></label>
            <select id="send-trial-season" className="form-input" value={form.season} onChange={e => set('season', e.target.value)}>
              <option value="">— Select Season (or default) —</option>
              {filteredSeasons.map((s: Season) => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Experimental Design Type</label>
            <select
              id="send-trial-design"
              className="form-input"
              value={form.design_type}
              onChange={e => set('design_type', e.target.value)}
            >
              {DESIGN_OPTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {!isUnrep && !isLatinSquare && (
            <div className="form-group">
              <label className="form-label">
                Number of Replications {form.design_type === 'augmented' ? '(Check Reps)' : ''}
              </label>
              <input
                id="send-trial-reps"
                type="number"
                min={1}
                max={12}
                className="form-input"
                value={form.num_reps}
                onChange={e => set('num_reps', e.target.value)}
              />
            </div>
          )}

          {isAlpha && (
            <div className="form-group">
              <label className="form-label">Incomplete Block Size (k)</label>
              <input
                id="send-trial-block-size"
                type="number"
                min={2}
                max={50}
                className="form-input"
                value={form.block_size}
                onChange={e => set('block_size', e.target.value)}
                placeholder="e.g. 4"
              />
            </div>
          )}

          {isPRep && (
            <div className="form-group">
              <label className="form-label">P-Rep Replicated Fraction (0.05 – 1.0)</label>
              <input
                id="send-trial-prep-fraction"
                type="number"
                min={0.05}
                max={1.0}
                step={0.05}
                className="form-input"
                value={form.prep_fraction}
                onChange={e => set('prep_fraction', e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Randomization Seed</label>
            <input
              id="send-trial-seed"
              type="number"
              className="form-input"
              value={form.randomization_seed}
              onChange={e => set('randomization_seed', e.target.value)}
              placeholder="e.g. 42"
            />
          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: 'var(--space-5)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" id="send-trial-submit-btn" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating & Generating Field...' : '🌱 Create Field & Layout'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

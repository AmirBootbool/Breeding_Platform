import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, Trial, Location, Season, ApiError } from '../../api/client'

interface CloneTrialModalProps {
  trial: Trial
  locationList: Location[]
  seasonList: Season[]
  onClose: () => void
}

export default function CloneTrialModal({ trial, locationList, seasonList, onClose }: CloneTrialModalProps) {
  const qc = useQueryClient()
  const [location, setLocation] = useState(String(trial.location))
  const [season, setSeason] = useState(String(trial.season))
  const [error, setError] = useState('')

  const filteredSeasons = seasonList.filter(s => !s.program || s.program === trial.program)

  const cloneMutation = useMutation({
    mutationFn: () => trials.create({
      name: `${trial.name} (Copy)`,
      trial_code: `${trial.trial_code}-COPY`,
      program: trial.program,
      location: Number(location),
      season: Number(season),
      design_type: trial.design_type,
      num_reps: trial.num_reps,
      block_size: trial.block_size,
      prep_fraction: trial.prep_fraction,
      field_rows: trial.field_rows,
      field_cols: trial.field_cols,
      starting_corner: trial.starting_corner,
      advancement_direction: trial.advancement_direction,
      layout_schema: trial.layout_schema,
      purpose: trial.purpose,
      notes: trial.notes,
      status: 'active',
      generation: trial.generation,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="text-sm text-muted">
        Clone <strong>{trial.trial_code}</strong>'s design (reps, block size, field layout) into a new trial with no plots or observations. Pick the season and location for the new trial.
      </p>
      {error && <div className="alert alert-error"><span>⚠</span><span>{error}</span></div>}
      <div className="form-group">
        <label className="form-label">Location</label>
        <select className="form-input" value={location} onChange={e => setLocation(e.target.value)}>
          {locationList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Season</label>
        <select className="form-input" value={season} onChange={e => setSeason(e.target.value)}>
          {filteredSeasons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
        </select>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={cloneMutation.isPending}>Cancel</button>
        <button className="btn btn-primary" onClick={() => cloneMutation.mutate()} disabled={cloneMutation.isPending}>
          {cloneMutation.isPending ? 'Cloning…' : 'Clone Trial'}
        </button>
      </div>
    </div>
  )
}

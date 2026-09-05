import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, Trial, Program, Location, Season, ApiError } from '../../api/client'
import { DESIGN_TYPES, DESIGN_TYPE_LABELS } from './types'

interface TrialFormModalProps {
  initial?: Partial<Trial>
  programList: Program[]
  locationList: Location[]
  seasonList: Season[]
  onClose: () => void
  isEdit?: boolean
  editId?: number
}

export default function TrialFormModal({
  initial,
  programList,
  locationList,
  seasonList,
  onClose,
  isEdit,
  editId,
}: TrialFormModalProps) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    trial_code: initial?.trial_code ?? '',
    program: initial?.program?.toString() ?? (programList[0]?.id?.toString() ?? ''),
    location: initial?.location?.toString() ?? (locationList[0]?.id?.toString() ?? ''),
    season: initial?.season?.toString() ?? '',
    design_type: initial?.design_type ?? 'RCBD',
    num_reps: initial?.num_reps?.toString() ?? '1',
    block_size: initial?.block_size?.toString() ?? '',
    prep_fraction: initial?.prep_fraction?.toString() ?? '0.25',
    planting_date: initial?.planting_date ?? '',
    harvest_date: initial?.harvest_date ?? '',
    notes: initial?.notes ?? '',
    status: initial?.status ?? 'active',
    generation: initial?.generation?.toString() ?? '',
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
        block_size: ['alpha_lattice', 'augmented_block'].includes(form.design_type) ? Number(form.block_size) : null,
        prep_fraction: form.design_type === 'prep' ? Number(form.prep_fraction) : null,
        notes: form.notes,
        status: form.status,
        generation: form.generation !== '' ? Number(form.generation) : null,
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

  function set(field: string, val: string) {
    setForm(prev => ({ ...prev, [field]: val }))
  }

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
            {DESIGN_TYPES.map(d => <option key={d} value={d}>{DESIGN_TYPE_LABELS[d] || d}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Replications {form.design_type === 'latin_square' && '(Forced to 1 for Latin Square)'}</label>
          <input id="trial-reps" className="form-input" type="number" min={1} value={form.design_type === 'latin_square' ? '1' : form.num_reps} disabled={form.design_type === 'latin_square'} onChange={e => set('num_reps', e.target.value)} />
        </div>
        {['alpha_lattice', 'augmented_block'].includes(form.design_type) && (
          <div className="form-group">
            <label className="form-label">Block Size <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <input id="trial-block-size" className="form-input" type="number" min={2} value={form.block_size} onChange={e => set('block_size', e.target.value)} placeholder="e.g. 4" />
          </div>
        )}
        {form.design_type === 'prep' && (
          <div className="form-group">
            <label className="form-label">P-Rep Fraction <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <input id="trial-prep-fraction" className="form-input" type="number" min={0.05} max={1.0} step={0.05} value={form.prep_fraction} onChange={e => set('prep_fraction', e.target.value)} placeholder="e.g. 0.25" />
          </div>
        )}
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
        <div className="form-group">
          <label className="form-label">Status</label>
          <select id="trial-status" className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Breeding Generation</label>
          <select id="trial-generation" className="form-input" value={form.generation} onChange={e => set('generation', e.target.value)}>
            <option value="">— Not set —</option>
            {[0,1,2,3,4,5,6,7,8].map(g => (
              <option key={g} value={g}>{['F0','F1','F2','F3','F4','F5','F6','F7','F8+'][g]}</option>
            ))}
          </select>
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
            if (['alpha_lattice', 'augmented_block'].includes(form.design_type)) {
              if (!form.block_size) {
                setError(`Block Size is required for ${DESIGN_TYPE_LABELS[form.design_type]}.`)
                return
              }
              if (Number(form.block_size) < 2) {
                setError('Block Size must be at least 2.')
                return
              }
            }
            if (form.design_type === 'prep') {
              if (!form.prep_fraction) {
                setError('P-Rep Fraction is required for P-Rep designs.')
                return
              }
              const frac = Number(form.prep_fraction)
              if (frac <= 0 || frac > 1.0) {
                setError('P-Rep Fraction must be between 0.0 and 1.0.')
                return
              }
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

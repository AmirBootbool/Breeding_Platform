import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { programs, locations, seasons, trials, Program, Location, Season, ApiError } from '../api/client'
import Modal from './Modal'

interface SendToTrialModalProps {
  germplasmIds: number[]
  onClose: () => void
  onSuccess: (trialId: number) => void
}

export default function SendToTrialModal({ germplasmIds, onClose, onSuccess }: SendToTrialModalProps) {
  const qc = useQueryClient()
  
  const [form, setForm] = useState({
    name: '',
    program: '',
    location: '',
    season: '',
    design_type: 'unreplicated',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.program) {
      setError('Name and Program are required.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      // 1. Create Trial
      const payload: Record<string, unknown> = {
        name: form.name,
        program: Number(form.program),
        design_type: form.design_type,
      }
      if (form.location) payload.location = Number(form.location)
      if (form.season) payload.season = Number(form.season)

      const newTrial = await trials.create(payload)

      // 2. Generate Plots with the selected germplasm
      await trials.createPlots(newTrial.id, {
        germplasm_ids: germplasmIds,
        seed: Number(form.randomization_seed) || 42,
      })

      qc.invalidateQueries({ queryKey: ['trials'] })
      onSuccess(newTrial.id)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(JSON.stringify(err.detail))
      } else {
        setError((err as Error).message)
      }
    } finally {
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
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Field/Trial Name <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. F2-NURSERY-2026" required />
          </div>
          <div className="form-group">
            <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
            <select className="form-input" value={form.program} onChange={e => set('program', e.target.value)} required>
              <option value="">— Select —</option>
              {programList.map((p: Program) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <select className="form-input" value={form.location} onChange={e => set('location', e.target.value)}>
              <option value="">— Select —</option>
              {locationList.map((l: Location) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Season</label>
            <select className="form-input" value={form.season} onChange={e => set('season', e.target.value)}>
              <option value="">— Select —</option>
              {seasonList.map((s: Season) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Design Type</label>
            <select className="form-input" value={form.design_type} onChange={e => set('design_type', e.target.value)}>
              <option value="unreplicated">Unreplicated (Head-to-Row)</option>
              <option value="rcbd">RCBD (Replicated)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Randomization Seed</label>
            <input type="number" className="form-input" value={form.randomization_seed} onChange={e => set('randomization_seed', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create & Populate'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

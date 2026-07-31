import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, plots, observationVariables, observations, Trial, Plot, ObservationVariable, ApiError } from '../api/client'
import TopBar from '../components/TopBar'
import ObservationGrid from '../components/ObservationGrid'

// ---- Observation form for a single plot -------------------------------------
function ObsForm({ plot, variables }: { plot: Plot; variables: ObservationVariable[] }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<number, string>>({})

  const mutation = useMutation({
    mutationFn: async () => {
      const numericVars = variables.filter(v => v.data_type === 'numeric')
      for (const v of numericVars) {
        const raw = values[v.id]
        if (!raw && !v.is_required) continue
        if (v.is_required && !raw) throw new Error(`${v.name} is required`)
        const num = parseFloat(raw)
        if (isNaN(num)) throw new Error(`${v.name} must be a number`)
        if (v.min_value !== null && num < v.min_value) throw new Error(`${v.name} must be ≥ ${v.min_value}`)
        if (v.max_value !== null && num > v.max_value) throw new Error(`${v.name} must be ≤ ${v.max_value}`)
      }
      // Submit each filled variable
      const promises = variables
        .filter(v => values[v.id] !== undefined && values[v.id] !== '')
        .map(v => {
          const payload: Record<string, unknown> = { plot: plot.id, variable: v.id }
          if (v.data_type === 'numeric') payload.value_numeric = parseFloat(values[v.id])
          else if (v.data_type === 'text') payload.value_text = values[v.id]
          else if (v.data_type === 'date') payload.value_date = values[v.id]
          return observations.create(payload)
        })
      await Promise.all(promises)
    },
    onSuccess: () => {
      setSuccess(true)
      setValues({})
      setErrors({})
      queryClient.invalidateQueries({ queryKey: ['recent-observations'] })
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors({ _: JSON.stringify(err.detail) } as Record<number, string>)
      } else {
        setErrors({ _: (err as Error).message } as Record<number, string>)
      }
    },
  })

  function inputType(v: ObservationVariable) {
    if (v.data_type === 'numeric') return 'number'
    if (v.data_type === 'date') return 'date'
    return 'text'
  }

  return (
    <div className="card fade-in">
      <div className="flex items-center gap-4 mb-6">
        <div>
          <div className="card-title">Plot {plot.plot_number}</div>
          <div style={{ fontWeight: 600 }}>{plot.germplasm_name}</div>
          <div className="text-xs text-muted">Rep {plot.rep}</div>
        </div>
      </div>

      {success && (
        <div className="alert alert-success mb-4">
          <span>✓</span>
          <span>Observations saved successfully.</span>
        </div>
      )}

      {(errors as Record<string, string>)._ && (
        <div className="alert alert-error mb-4">
          <span>⚠</span>
          <span>{(errors as Record<string, string>)._}</span>
        </div>
      )}

      <div className="form-grid">
        {variables.map(v => (
          <div key={v.id} className="form-group">
            <label htmlFor={`obs-${plot.id}-${v.id}`} className="form-label">
              {v.name}
              {v.unit && <span className="text-muted"> ({v.unit})</span>}
              {v.is_required && <span style={{ color: 'var(--status-danger)' }}> *</span>}
            </label>
            <input
              id={`obs-${plot.id}-${v.id}`}
              type={inputType(v)}
              className={`form-input ${errors[v.id] ? 'error' : ''}`}
              value={values[v.id] ?? ''}
              onChange={e => setValues(prev => ({ ...prev, [v.id]: e.target.value }))}
              min={v.min_value ?? undefined}
              max={v.max_value ?? undefined}
              step={v.data_type === 'numeric' ? 'any' : undefined}
              placeholder={
                v.data_type === 'numeric'
                  ? `${v.min_value ?? ''} – ${v.max_value ?? ''}`
                  : v.data_type
              }
            />
            {errors[v.id] && <span className="form-error">{errors[v.id]}</span>}
            {v.description && <span className="text-xs text-muted">{v.description}</span>}
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          id={`submit-obs-plot-${plot.id}`}
          className="btn btn-primary"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <><div className="spinner" /> Saving…</> : '✓ Save Observations'}
        </button>
        <button className="btn btn-secondary" onClick={() => setValues({})}>Clear</button>
      </div>
    </div>
  )
}

// ---- Main page ---------------------------------------------------------------
export default function ObservationEntry() {
  const [selectedTrial, setSelectedTrial] = useState<Trial | null>(null)
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null)
  const [isGridView, setIsGridView] = useState(false)

  const { data: trialsData, isLoading: trialsLoading } = useQuery({
    queryKey: ['trials-all'],
    queryFn: () => trials.list(),
  })

  const { data: plotData } = useQuery({
    queryKey: ['plots-for-trial', selectedTrial?.id],
    queryFn: () => plots.list(`&trial=${selectedTrial!.id}`),
    enabled: !!selectedTrial,
  })

  const { data: variablesData } = useQuery({
    queryKey: ['observation-variables'],
    queryFn: () => observationVariables.list(),
  })

  const plotList = plotData?.results ?? []
  const variableList = variablesData?.results ?? []

  return (
    <div className="page-shell">
      <TopBar
        title="Observation Entry"
        subtitle="Record phenotypic data by trial and plot"
        actions={selectedTrial ? (
          <div className="flex gap-2">
            <button
              className={`btn ${!isGridView ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setIsGridView(false)}
            >
              Single Plot Form
            </button>
            <button
              className={`btn ${isGridView ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setIsGridView(true)}
            >
              Spreadsheet Grid View
            </button>
          </div>
        ) : undefined}
      />

      {!selectedTrial ? (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-8)', alignItems: 'start' }}>
          <div className="card-glass">
            <div className="card-title mb-4">1. Select Trial</div>
            {trialsLoading ? (
              <div className="loading-spinner" style={{ padding: 'var(--space-4)' }}><div className="spinner" /></div>
            ) : (
              <select
                id="obs-trial-select"
                className="form-input"
                value=""
                onChange={e => {
                  const t = trialsData?.results.find((x: any) => x.id === Number(e.target.value)) ?? null
                  setSelectedTrial(t)
                  setSelectedPlot(null)
                }}
              >
                <option value="">— Choose trial —</option>
                {trialsData?.results.map(t => (
                  <option key={t.id} value={t.id}>{t.trial_code} — {t.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="empty-state" style={{ paddingTop: 'var(--space-12)' }}>
            <div className="empty-icon">✏️</div>
            <p>Select a trial to begin recording observations.</p>
          </div>
        </div>
      ) : isGridView ? (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-8)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="card-glass">
              <div className="card-title mb-4">Select Trial</div>
              <select
                id="obs-trial-select"
                className="form-input"
                value={selectedTrial?.id ?? ''}
                onChange={e => {
                  const t = trialsData?.results.find((x: any) => x.id === Number(e.target.value)) ?? null
                  setSelectedTrial(t)
                  setSelectedPlot(null)
                }}
              >
                {trialsData?.results.map(t => (
                  <option key={t.id} value={t.id}>{t.trial_code} — {t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <ObservationGrid trial={selectedTrial} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-8)', alignItems: 'start' }}>
          {/* Selection panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="card-glass">
              <div className="card-title mb-4">1. Select Trial</div>
              <select
                id="obs-trial-select"
                className="form-input"
                value={selectedTrial?.id ?? ''}
                onChange={e => {
                  const t = trialsData?.results.find((x: any) => x.id === Number(e.target.value)) ?? null
                  setSelectedTrial(t)
                  setSelectedPlot(null)
                }}
              >
                {trialsData?.results.map(t => (
                  <option key={t.id} value={t.id}>{t.trial_code} — {t.name}</option>
                ))}
              </select>
            </div>

            <div className="card-glass">
              <div className="card-title mb-4">2. Select Plot</div>
              {plotList.length === 0 ? (
                <p className="text-sm text-muted">No plots. Generate layout first.</p>
              ) : (
                <select
                  id="obs-plot-select"
                  className="form-input"
                  value={selectedPlot?.id ?? ''}
                  onChange={e => {
                    const p = plotList.find(x => x.id === Number(e.target.value)) ?? null
                    setSelectedPlot(p)
                  }}
                >
                  <option value="">— Choose plot —</option>
                  {plotList.map(p => (
                    <option key={p.id} value={p.id}>
                      Plot {p.plot_number} | Rep {p.rep} | {p.germplasm_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {variableList.length > 0 && (
              <div className="card-glass">
                <div className="card-title">Observation Variables</div>
                <div className="flex flex-col gap-2 mt-3">
                  {variableList.map(v => (
                    <div key={v.id} className="flex items-center justify-between">
                      <span className="text-sm">{v.name}</span>
                      <span className="badge badge-gray">{v.data_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Observation form */}
          <div>
            {!selectedPlot ? (
              <div className="empty-state" style={{ paddingTop: 'var(--space-12)' }}>
                <div className="empty-icon">⊞</div>
                <p>Select a plot to record observations.</p>
              </div>
            ) : variableList.length === 0 ? (
              <div className="empty-state" style={{ paddingTop: 'var(--space-12)' }}>
                <div className="empty-icon">📋</div>
                <p>No observation variables defined. Create some via the Setup page.</p>
              </div>
            ) : (
              <ObsForm plot={selectedPlot} variables={variableList} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}


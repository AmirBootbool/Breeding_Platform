import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { plots, observationVariables, observations, Trial, ObservationVariable, ApiError } from '../api/client'

interface ObservationGridProps {
  trial: Trial
}

export default function ObservationGrid({ trial }: ObservationGridProps) {
  const queryClient = useQueryClient()
  const [currentValues, setCurrentValues] = useState<Record<string, string>>({})
  const [initialValues, setInitialValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)

  // Fetch plots for this trial
  const { data: plotData, isLoading: plotsLoading } = useQuery({
    queryKey: ['plots-for-trial', trial.id],
    queryFn: () => plots.list(`&trial=${trial.id}`),
  })

  // Fetch all observation variables
  const { data: variablesData, isLoading: variablesLoading } = useQuery({
    queryKey: ['observation-variables'],
    queryFn: () => observationVariables.list(),
  })

  // Fetch existing observations for this trial
  const { data: obsData, isLoading: obsLoading } = useQuery({
    queryKey: ['observations-for-trial', trial.id],
    queryFn: () => observations.list(`&plot__trial=${trial.id}`),
  })

  const plotList = plotData?.results ?? []
  const variableList = variablesData?.results ?? []
  const existingObsList = obsData?.results ?? []

  // Initialize values when data is loaded
  useEffect(() => {
    if (plotList.length && variableList.length) {
      const vals: Record<string, string> = {}
      
      // Initialize with empty strings
      plotList.forEach(p => {
        variableList.forEach(v => {
          vals[`${p.id}-${v.id}`] = ''
        })
      })

      // Populate with existing observations
      existingObsList.forEach(obs => {
        const key = `${obs.plot}-${obs.variable}`
        if (obs.value_numeric !== null) {
          vals[key] = obs.value_numeric.toString()
        } else if (obs.value_text) {
          vals[key] = obs.value_text
        } else if (obs.value_date) {
          vals[key] = obs.value_date
        }
      })

      setCurrentValues(vals)
      setInitialValues({ ...vals })
      setErrors({})
    }
  }, [plotData, variablesData, obsData])

  const mutation = useMutation({
    mutationFn: async (payload: any[]) => {
      return observations.bulkCreate({ observations: payload })
    },
    onSuccess: () => {
      setSuccess(true)
      setErrors({})
      queryClient.invalidateQueries({ queryKey: ['observations-for-trial', trial.id] })
      queryClient.invalidateQueries({ queryKey: ['recent-observations'] })
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const errDetail = err.detail as { errors?: { index: number; detail: any }[] }
        if (errDetail?.errors) {
          const newErrors: Record<string, string> = {}
          errDetail.errors.forEach(e => {
            // Get the original dirty payload index to identify which plot/variable failed
            // We'll map the index back to the cell key when constructing the payload
            const fieldKeys = Object.keys(e.detail)
            const detailMsg = fieldKeys.map(k => `${k}: ${JSON.stringify(e.detail[k])}`).join(', ')
            newErrors[`row-${e.index}`] = detailMsg
          })
          setErrors(newErrors)
        } else {
          setErrors({ _: JSON.stringify(err.detail) })
        }
      } else {
        setErrors({ _: (err as Error).message })
      }
    },
  })

  if (plotsLoading || variablesLoading || obsLoading) {
    return <div className="loading-spinner"><div className="spinner" /> Loading grid data…</div>
  }

  if (plotList.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <p>No plots generated for this trial yet. Go to Trial Manager to create layout.</p>
      </div>
    )
  }

  if (variableList.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚙</div>
        <p>No observation variables defined. Add them in the Setup page.</p>
      </div>
    )
  }

  // Find dirty cells and save
  const handleSave = () => {
    setErrors({})
    setSuccess(false)
    const dirtyPayload: any[] = []
    const keyMapping: string[] = [] // maps index of dirtyPayload to cell key

    Object.keys(currentValues).forEach(key => {
      if (currentValues[key] !== initialValues[key]) {
        const [plotId, varId] = key.split('-').map(Number)
        const v = variableList.find(x => x.id === varId)
        const val = currentValues[key].trim()

        // If value was cleared and it wasn't empty initially, we can submit an empty object,
        // but let's only submit if there is a value or if we want to clear it (we set null/empty)
        const payloadItem: any = { plot: plotId, variable: varId }
        
        if (val === '') {
          payloadItem.value_numeric = null
          payloadItem.value_text = ''
          payloadItem.value_date = null
        } else if (v?.data_type === 'numeric' || v?.data_type === 'integer') {
          payloadItem.value_numeric = parseFloat(val)
        } else if (v?.data_type === 'date') {
          payloadItem.value_date = val
        } else {
          payloadItem.value_text = val
        }

        dirtyPayload.push(payloadItem)
        keyMapping.push(key)
      }
    })

    if (dirtyPayload.length === 0) {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      return
    }

    // Pass keyMapping to mutation so we can highlight correct cells on error
    mutation.mutate(dirtyPayload, {
      onError: (err) => {
        if (err instanceof ApiError) {
          const errDetail = err.detail as { errors?: { index: number; detail: any }[] }
          if (errDetail?.errors) {
            const cellErrors: Record<string, string> = {}
            errDetail.errors.forEach(e => {
              const cellKey = keyMapping[e.index]
              const fieldKeys = Object.keys(e.detail)
              const detailMsg = fieldKeys.map(k => `${k}: ${JSON.stringify(e.detail[k])}`).join(', ')
              cellErrors[cellKey] = detailMsg
            })
            setErrors(cellErrors)
          }
        }
      }
    })
  }

  function getCellInputType(v: ObservationVariable) {
    if (v.data_type === 'numeric' || v.data_type === 'integer') return 'number'
    if (v.data_type === 'date') return 'date'
    return 'text'
  }

  const isDirty = Object.keys(currentValues).some(k => currentValues[k] !== initialValues[k])

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="card-title">Grid Entry — {trial.trial_code}</h3>
          <p className="text-xs text-muted">
            Enter observations directly in the spreadsheet below. Only changed cells will be saved.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={mutation.isPending || !isDirty}
        >
          {mutation.isPending ? <><div className="spinner" /> Saving…</> : 'Save All Changes'}
        </button>
      </div>

      {success && (
        <div className="alert alert-success">
          <span>✓</span><span>All observation changes saved successfully.</span>
        </div>
      )}

      {errors._ && (
        <div className="alert alert-error">
          <span>⚠</span><span>{errors._}</span>
        </div>
      )}

      <div className="table-container" style={{ overflowX: 'auto', maxHeight: '500px' }}>
        <table className="data-table observation-grid-table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-card)' }}>Plot</th>
              <th style={{ position: 'sticky', left: '80px', zIndex: 2, background: 'var(--bg-card)' }}>Germplasm</th>
              <th>Rep</th>
              {variableList.map(v => (
                <th key={v.id} title={v.description}>
                  {v.name}
                  {v.unit && <span className="text-muted" style={{ fontWeight: 400 }}> ({v.unit})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plotList.map(p => (
              <tr key={p.id}>
                <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-card)', fontWeight: 600 }}>
                  {p.plot_number}
                </td>
                <td style={{ position: 'sticky', left: '80px', zIndex: 1, background: 'var(--bg-card)' }}>
                  {p.germplasm_name}
                </td>
                <td>{p.rep}</td>
                {variableList.map(v => {
                  const cellKey = `${p.id}-${v.id}`
                  const value = currentValues[cellKey] ?? ''
                  const initial = initialValues[cellKey] ?? ''
                  const hasError = !!errors[cellKey]
                  const cellDirty = value !== initial

                  return (
                    <td key={v.id} style={{ padding: '4px' }}>
                      <input
                        type={getCellInputType(v)}
                        value={value}
                        onChange={e => setCurrentValues(prev => ({ ...prev, [cellKey]: e.target.value }))}
                        className={`form-input grid-input ${cellDirty ? 'grid-dirty' : ''} ${hasError ? 'error' : ''}`}
                        min={v.min_value ?? undefined}
                        max={v.max_value ?? undefined}
                        step={v.data_type === 'numeric' ? 'any' : undefined}
                        title={errors[cellKey] || undefined}
                        style={{
                          margin: 0,
                          padding: '6px 8px',
                          minWidth: '100px',
                          border: cellDirty ? '1px solid var(--brand-300)' : undefined,
                          backgroundColor: hasError ? 'rgba(var(--status-danger-rgb), 0.1)' : undefined
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

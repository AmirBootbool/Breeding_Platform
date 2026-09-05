import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  plots, observationVariables, observations, traitPanels,
  Trial, ObservationVariable, ApiError
} from '../api/client'
import Modal from './Modal'

interface ObservationGridProps {
  trial: Trial
}

export default function ObservationGrid({ trial }: ObservationGridProps) {
  const queryClient = useQueryClient()
  const [currentValues, setCurrentValues] = useState<Record<string, string>>({})
  const [initialValues, setInitialValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)

  // Filters
  const [selectedPanelId, setSelectedPanelId] = useState<number | ''>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [showBatchFill, setShowBatchFill] = useState(false)
  const [batchVariableId, setBatchVariableId] = useState<number | null>(null)
  const [batchValue, setBatchValue] = useState<string>('')
  const [batchScope, setBatchScope] = useState<'empty' | 'all'>('empty')

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

  // Fetch trait panels
  const { data: panelsData } = useQuery({
    queryKey: ['trait-panels'],
    queryFn: () => traitPanels.list(),
  })

  // Fetch existing observations for this trial
  const { data: obsData, isLoading: obsLoading } = useQuery({
    queryKey: ['observations-for-trial', trial.id],
    queryFn: () => observations.list(`&plot__trial=${trial.id}`),
  })

  const plotList = plotData?.results ?? []
  const allVariables = variablesData?.results ?? []
  const panelList = panelsData?.results ?? []
  const existingObsList = obsData?.results ?? []

  // Filter variables by panel and/or category
  const variableList = useMemo(() => {
    let vars = allVariables
    if (selectedPanelId) {
      const panel = panelList.find(p => p.id === selectedPanelId)
      if (panel) {
        vars = vars.filter(v => panel.variable_ids.includes(v.id))
      }
    }
    if (selectedCategory) {
      vars = vars.filter(v => v.category === selectedCategory)
    }
    return vars
  }, [allVariables, panelList, selectedPanelId, selectedCategory])

  // Initialize values when data is loaded
  useEffect(() => {
    if (plotList.length && allVariables.length) {
      const vals: Record<string, string> = {}
      
      plotList.forEach(p => {
        allVariables.forEach(v => {
          vals[`${p.id}-${v.id}`] = ''
        })
      })

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

  // Compute column statistics
  const columnStats = useMemo(() => {
    const stats: Record<number, { count: number; mean: number | null; min: number | null; max: number | null; missing: number }> = {}
    
    variableList.forEach(v => {
      const numericVals: number[] = []
      let filledCount = 0

      plotList.forEach(p => {
        const val = currentValues[`${p.id}-${v.id}`]
        if (val !== undefined && val.trim() !== '') {
          filledCount++
          if (v.data_type === 'numeric' || v.data_type === 'integer') {
            const num = parseFloat(val)
            if (!isNaN(num)) numericVals.push(num)
          }
        }
      })

      const missing = plotList.length - filledCount
      if (numericVals.length > 0) {
        const sum = numericVals.reduce((a, b) => a + b, 0)
        stats[v.id] = {
          count: filledCount,
          mean: parseFloat((sum / numericVals.length).toFixed(2)),
          min: Math.min(...numericVals),
          max: Math.max(...numericVals),
          missing,
        }
      } else {
        stats[v.id] = {
          count: filledCount,
          mean: null,
          min: null,
          max: null,
          missing,
        }
      }
    })

    return stats
  }, [variableList, plotList, currentValues])

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

  const handleSave = () => {
    setErrors({})
    setSuccess(false)
    const dirtyPayload: any[] = []
    const keyMapping: string[] = []

    Object.keys(currentValues).forEach(key => {
      if (currentValues[key] !== initialValues[key]) {
        const [plotId, varId] = key.split('-').map(Number)
        const v = allVariables.find(x => x.id === varId)
        const val = currentValues[key].trim()

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

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    let targetRow = rowIndex
    let targetCol = colIndex

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      targetRow = Math.min(rowIndex + 1, plotList.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      targetRow = Math.max(rowIndex - 1, 0)
    } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      if (e.key === 'Tab') e.preventDefault()
      if (colIndex < variableList.length - 1) {
        targetCol = colIndex + 1
      } else if (rowIndex < plotList.length - 1) {
        targetRow = rowIndex + 1
        targetCol = 0
      }
    } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      if (e.key === 'Tab') e.preventDefault()
      if (colIndex > 0) {
        targetCol = colIndex - 1
      } else if (rowIndex > 0) {
        targetRow = rowIndex - 1
        targetCol = variableList.length - 1
      }
    } else {
      return
    }

    if (targetRow !== rowIndex || targetCol !== colIndex) {
      const nextInput = document.getElementById(`grid-cell-${targetRow}-${targetCol}`) as HTMLInputElement | null
      if (nextInput) {
        nextInput.focus()
        if ('select' in nextInput) nextInput.select()
      }
    }
  }

  const applyBatchFill = () => {
    if (!batchVariableId || batchValue === '') return
    const newVals = { ...currentValues }
    plotList.forEach(p => {
      const key = `${p.id}-${batchVariableId}`
      if (batchScope === 'all' || !newVals[key] || newVals[key].trim() === '') {
        newVals[key] = batchValue
      }
    })
    setCurrentValues(newVals)
    setShowBatchFill(false)
    setBatchValue('')
  }

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

  const isDirty = Object.keys(currentValues).some(k => currentValues[k] !== initialValues[k])

  return (
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Top Header & Filters */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 className="card-title">Grid Entry & Trait Panels — {trial.trial_code}</h3>
          <p className="text-xs text-muted">
            Enter observations directly. Navigate with <kbd>Enter</kbd> / <kbd>Arrows</kbd> / <kbd>Tab</kbd>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Panel filter */}
          <select
            className="form-input"
            style={{ width: 160, padding: '4px 8px', fontSize: '0.8rem' }}
            value={selectedPanelId}
            onChange={e => setSelectedPanelId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All Traits ({allVariables.length})</option>
            {panelList.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.variable_ids.length})</option>
            ))}
          </select>

          {/* Category filter */}
          <select
            className="form-input"
            style={{ width: 150, padding: '4px 8px', fontSize: '0.8rem' }}
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="morphological">Morphological</option>
            <option value="agronomic">Agronomic</option>
            <option value="disease">Disease</option>
            <option value="quality">Quality</option>
            <option value="phenology">Phenology</option>
            <option value="abiotic">Abiotic</option>
          </select>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (variableList.length > 0) {
                setBatchVariableId(variableList[0].id)
                setShowBatchFill(true)
              }
            }}
          >
            ⚡ Batch Fill
          </button>

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={mutation.isPending || !isDirty}
          >
            {mutation.isPending ? <><div className="spinner" /> Saving…</> : 'Save All Changes'}
          </button>
        </div>
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

      <div className="table-container" style={{ overflowX: 'auto', maxHeight: '550px' }}>
        <table className="data-table observation-grid-table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg-card)' }}>Plot</th>
              <th style={{ position: 'sticky', left: '70px', zIndex: 3, background: 'var(--bg-card)' }}>Germplasm</th>
              <th style={{ width: 50 }}>Rep</th>
              {variableList.map(v => (
                <th key={v.id} title={v.description} style={{ minWidth: 120 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    <div className="text-xs text-muted" style={{ fontWeight: 400 }}>
                      {v.unit ? `(${v.unit})` : v.data_type}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plotList.map((p, pIdx) => (
              <tr key={p.id}>
                <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-card)', fontWeight: 600 }}>
                  {p.plot_number} {p.is_check && <span style={{ fontSize: '9px', background: 'var(--amber-500)', color: '#000', padding: '0 3px', borderRadius: '2px' }}>C</span>}
                </td>
                <td style={{ position: 'sticky', left: '70px', zIndex: 2, background: 'var(--bg-card)', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.germplasm_name}
                </td>
                <td>{p.rep}</td>
                {variableList.map((v, vIdx) => {
                  const cellKey = `${p.id}-${v.id}`
                  const value = currentValues[cellKey] ?? ''
                  const initial = initialValues[cellKey] ?? ''
                  const hasError = !!errors[cellKey]
                  const cellDirty = value !== initial

                  return (
                    <td key={v.id} style={{ padding: '3px' }}>
                      {v.data_type === 'categorical' && v.categorical_options && v.categorical_options.length > 0 ? (
                        <select
                          id={`grid-cell-${pIdx}-${vIdx}`}
                          value={value}
                          onChange={e => setCurrentValues(prev => ({ ...prev, [cellKey]: e.target.value }))}
                          onKeyDown={e => handleKeyDown(e, pIdx, vIdx)}
                          className={`form-input grid-input ${cellDirty ? 'grid-dirty' : ''}`}
                          style={{
                            margin: 0,
                            padding: '4px 6px',
                            minWidth: '100px',
                            border: cellDirty ? '1px solid var(--brand-300)' : undefined,
                          }}
                        >
                          <option value="">—</option>
                          {v.categorical_options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`grid-cell-${pIdx}-${vIdx}`}
                          type={getCellInputType(v)}
                          value={value}
                          onChange={e => setCurrentValues(prev => ({ ...prev, [cellKey]: e.target.value }))}
                          onKeyDown={e => handleKeyDown(e, pIdx, vIdx)}
                          className={`form-input grid-input ${cellDirty ? 'grid-dirty' : ''} ${hasError ? 'error' : ''}`}
                          min={v.min_value ?? undefined}
                          max={v.max_value ?? undefined}
                          step={v.data_type === 'numeric' ? 'any' : undefined}
                          title={errors[cellKey] || undefined}
                          style={{
                            margin: 0,
                            padding: '4px 6px',
                            minWidth: '100px',
                            border: cellDirty ? '1px solid var(--brand-300)' : undefined,
                            backgroundColor: hasError ? 'rgba(var(--status-danger-rgb), 0.1)' : undefined
                          }}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {/* Summary Statistics Footer */}
          <tfoot>
            <tr style={{ background: 'var(--bg-subtle)', fontWeight: 600, borderTop: '2px solid var(--border-default)' }}>
              <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-subtle)' }}>Summary</td>
              <td style={{ position: 'sticky', left: '70px', zIndex: 2, background: 'var(--bg-subtle)' }} className="text-xs text-muted">
                {plotList.length} plots
              </td>
              <td>—</td>
              {variableList.map(v => {
                const s = columnStats[v.id]
                if (!s) return <td key={v.id}>—</td>
                return (
                  <td key={v.id} style={{ fontSize: '0.72rem', padding: '6px' }}>
                    {s.mean !== null ? (
                      <div>
                        <div>Avg: <strong style={{ color: 'var(--brand-300)' }}>{s.mean}</strong></div>
                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>[{s.min} – {s.max}] ({s.count}/{plotList.length})</div>
                      </div>
                    ) : (
                      <div className="text-muted">{s.count}/{plotList.length} scored</div>
                    )}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Batch Fill Modal */}
      {showBatchFill && (
        <Modal title="Batch Fill Observations" onClose={() => setShowBatchFill(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Select Trait / Variable</label>
              <select
                className="form-input"
                value={batchVariableId ?? ''}
                onChange={e => setBatchVariableId(Number(e.target.value))}
              >
                {variableList.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.data_type})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Fill Value</label>
              <input
                type="text"
                className="form-input"
                value={batchValue}
                onChange={e => setBatchValue(e.target.value)}
                placeholder="e.g. 5.5, or resistance score"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Scope</label>
              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="batchScope"
                    checked={batchScope === 'empty'}
                    onChange={() => setBatchScope('empty')}
                  />
                  <span>Only empty cells</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="batchScope"
                    checked={batchScope === 'all'}
                    onChange={() => setBatchScope('all')}
                  />
                  <span>All plots (overwrite)</span>
                </label>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary" onClick={() => setShowBatchFill(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={applyBatchFill} disabled={!batchValue}>
                Apply to Grid
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

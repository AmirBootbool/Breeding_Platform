import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, germplasm, observations, observationVariables, Trial, Plot, ApiError } from '../../api/client'
import Modal from '../Modal'
import ConfirmDialog from '../ConfirmDialog'
import SendToTrialModal from '../SendToTrialModal'

interface AdvancePlotsTabProps {
  trial: Trial
  plotList: Plot[]
}

interface TraitCriteria {
  variableId: number
  operator: '>=' | '<=' | '>' | '<' | '='
  value: string
}

export default function AdvancePlotsTab({ trial, plotList }: AdvancePlotsTabProps) {
  const navigate = useNavigate()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [selectionsPerPlot, setSelectionsPerPlot] = useState('1')
  const [selectionMethod, setSelectionMethod] = useState('SSD')
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [advancedIds, setAdvancedIds] = useState<number[]>([])
  const [showAdvanceSuccessPrompt, setShowAdvanceSuccessPrompt] = useState(false)
  const [showSendToTrialModal, setShowSendToTrialModal] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'rank'>('list')
  const [rankVariable, setRankVariable] = useState<number | null>(null)
  const [rankDesc, setRankDesc] = useState(true)
  const [criteria, setCriteria] = useState<TraitCriteria[]>([])
  const [showCriteriaPanel, setShowCriteriaPanel] = useState(false)
  const qc = useQueryClient()

  const { data: variablesData } = useQuery({
    queryKey: ['observation-variables'],
    queryFn: () => observationVariables.list(),
  })

  const { data: obsData } = useQuery({
    queryKey: ['observations-for-trial', trial.id],
    queryFn: () => observations.list(`&plot__trial=${trial.id}&page_size=5000`),
  })

  const variableList = variablesData?.results ?? []
  const numericVars = variableList.filter(v => v.data_type === 'numeric' || v.data_type === 'integer')
  const obsList = obsData?.results ?? []

  // Build a lookup: plotId -> variableId -> value
  const obsLookup = useMemo(() => {
    const lookup: Record<number, Record<number, number>> = {}
    obsList.forEach(o => {
      if (o.value_numeric != null) {
        if (!lookup[o.plot]) lookup[o.plot] = {}
        lookup[o.plot][o.variable] = o.value_numeric
      }
    })
    return lookup
  }, [obsList])

  // Ranked plots by a variable
  const rankedPlots = useMemo(() => {
    if (!rankVariable) return plotList
    const sorted = [...plotList].sort((a, b) => {
      const av = obsLookup[a.id]?.[rankVariable] ?? null
      const bv = obsLookup[b.id]?.[rankVariable] ?? null
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return rankDesc ? bv - av : av - bv
    })
    return sorted
  }, [plotList, rankVariable, rankDesc, obsLookup])

  // Auto-select based on criteria
  function applyTraitCriteria() {
    const passing = plotList.filter(p => {
      return criteria.every(c => {
        const val = obsLookup[p.id]?.[c.variableId]
        if (val == null || c.value === '') return false
        const thresh = parseFloat(c.value)
        switch (c.operator) {
          case '>=': return val >= thresh
          case '<=': return val <= thresh
          case '>':  return val > thresh
          case '<':  return val < thresh
          case '=':  return val === thresh
          default:   return false
        }
      })
    })
    setSelectedIds(passing.map(p => p.id))
  }

  const getSelectedGermplasmIds = () =>
    selectedIds
      .map(id => plotList.find(p => p.id === id)?.germplasm)
      .filter((id): id is number => id !== undefined)

  const mutation = useMutation({
    mutationFn: () => trials.advancePlots(trial.id, {
      plot_ids: selectedIds,
      selections_per_plot: parseInt(selectionsPerPlot, 10) || 1,
      selection_method: selectionMethod,
    }),
    onSuccess: (data) => {
      setSuccessMsg(''); setErrorMsg(''); setSelectedIds([])
      setAdvancedIds(data.created_ids); setShowAdvanceSuccessPrompt(true)
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
      setSuccessMsg('')
    },
  })

  const bulkArchiveMutation = useMutation({
    mutationFn: () => germplasm.bulkArchive(getSelectedGermplasmIds()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['trial', trial.id] })
      setSelectedIds([]); setShowArchiveConfirm(false)
      setSuccessMsg(`Archived ${res.archived_count} accessions.`)
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => germplasm.bulkDelete(getSelectedGermplasmIds()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['trial', trial.id] })
      setSelectedIds([]); setShowDeleteConfirm(false)
      setSuccessMsg(`Deleted ${res.deleted_count} accessions.`)
    },
  })

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(plotList.map(p => p.id))
    else setSelectedIds([])
  }
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const selectionPct = plotList.length > 0 ? (selectedIds.length / plotList.length * 100).toFixed(1) : '0.0'
  const selectionIntensityWarning =
    parseFloat(selectionPct) > 0 && parseFloat(selectionPct) < 5
      ? 'Very high selection pressure (<5%)'
      : parseFloat(selectionPct) > 80
      ? 'Very low selection pressure (>80%)'
      : null

  if (plotList.length === 0) {
    return <div className="empty-state"><p>No plots available to advance.</p></div>
  }

  const displayPlots = viewMode === 'rank' ? rankedPlots : plotList

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="card-title" style={{ margin: 0 }}>Selection & Advancement</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className={`btn btn-sm ${showCriteriaPanel ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowCriteriaPanel(p => !p)}
          >
            🎯 Trait Criteria
          </button>
          <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 2 }}>
            <button className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('list')}>List</button>
            <button className={`btn btn-sm ${viewMode === 'rank' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('rank')}>Rank</button>
          </div>
        </div>
      </div>

      {/* Trait criteria panel */}
      {showCriteriaPanel && (
        <div className="card mb-4" style={{ background: 'var(--surface-2)' }}>
          <div className="card-title mb-3">🎯 Trait-Based Auto-Selection</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {criteria.map((c, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="form-input" style={{ flex: '1 1 160px' }} value={c.variableId}
                  onChange={e => {
                    const updated = [...criteria]
                    updated[idx] = { ...updated[idx], variableId: Number(e.target.value) }
                    setCriteria(updated)
                  }}>
                  <option value={0}>— Trait —</option>
                  {numericVars.map(v => <option key={v.id} value={v.id}>{v.name} {v.unit ? `(${v.unit})` : ''}</option>)}
                </select>
                <select className="form-input" style={{ flex: '0 0 70px' }} value={c.operator}
                  onChange={e => {
                    const updated = [...criteria]
                    updated[idx] = { ...updated[idx], operator: e.target.value as TraitCriteria['operator'] }
                    setCriteria(updated)
                  }}>
                  <option value=">=">≥</option>
                  <option value="<=">≤</option>
                  <option value=">">{'>'}</option>
                  <option value="<">{'<'}</option>
                  <option value="=">=</option>
                </select>
                <input className="form-input" type="number" style={{ flex: '0 0 100px' }} placeholder="value"
                  value={c.value} onChange={e => {
                    const updated = [...criteria]
                    updated[idx] = { ...updated[idx], value: e.target.value }
                    setCriteria(updated)
                  }} />
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-danger)' }}
                  onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setCriteria([...criteria, { variableId: numericVars[0]?.id ?? 0, operator: '>=', value: '' }])}>
                + Add Criterion
              </button>
              <button className="btn btn-primary btn-sm" disabled={criteria.length === 0} onClick={applyTraitCriteria}>
                ⚡ Auto-Select Passing Plots
              </button>
              {criteria.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setCriteria([])}>Clear all</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rank view controls */}
      {viewMode === 'rank' && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="form-label" style={{ margin: 0 }}>Rank by:</label>
          <select className="form-input" style={{ width: 200 }} value={rankVariable ?? ''} onChange={e => setRankVariable(Number(e.target.value) || null)}>
            <option value="">— Select trait —</option>
            {numericVars.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setRankDesc(d => !d)}>
            {rankDesc ? '▼ High → Low' : '▲ Low → High'}
          </button>
        </div>
      )}

      {/* Selection controls */}
      <div className="grid-3 gap-4 mb-4" style={{ alignItems: 'end' }}>
        <div className="form-group mb-0">
          <label className="form-label">Selection Method</label>
          <select className="form-input" value={selectionMethod} onChange={e => setSelectionMethod(e.target.value)}>
            <option value="SSD">Single-Seed-Descent (SSD)</option>
            <option value="Single Spike">Single Spike</option>
            <option value="Single Plant">Single Plant</option>
            <option value="Special Bulk">Special Bulk</option>
            <option value="bulk">Bulk</option>
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="form-label">Selections per plot</label>
          <input className="form-input" type="number" min="1" value={selectionsPerPlot} onChange={e => setSelectionsPerPlot(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <strong>{selectedIds.length}</strong> / {plotList.length} plots ({selectionPct}%)
            {selectionIntensityWarning && (
              <span style={{ color: 'var(--status-warning)', marginLeft: 8 }}>⚠ {selectionIntensityWarning}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" style={{ flex: 1 }}
              disabled={selectedIds.length === 0 || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Advancing...' : `▶ Advance ${selectedIds.length}`}
            </button>
            <button className="btn btn-secondary" disabled={selectedIds.length === 0} onClick={() => setShowArchiveConfirm(true)}>
              Archive
            </button>
            <button className="btn btn-secondary" style={{ color: 'var(--status-danger)' }}
              disabled={selectedIds.length === 0} onClick={() => setShowDeleteConfirm(true)}>
              Remove
            </button>
          </div>
        </div>
      </div>

      {successMsg && <div className="alert alert-success mb-4"><span>✓</span><span>{successMsg}</span></div>}
      {errorMsg   && <div className="alert alert-error mb-4"><span>⚠</span><span>{errorMsg}</span></div>}

      <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox"
                  checked={selectedIds.length === plotList.length && plotList.length > 0}
                  onChange={toggleSelectAll} />
              </th>
              <th>#</th>
              <th>Germplasm</th>
              <th>Rep</th>
              <th>Type</th>
              {viewMode === 'rank' && rankVariable && (
                <th>{numericVars.find(v => v.id === rankVariable)?.name ?? 'Value'}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayPlots.map((p, rank) => {
              const obsVal = rankVariable ? obsLookup[p.id]?.[rankVariable] : null
              return (
                <tr key={p.id} className={selectedIds.includes(p.id) ? 'selected-row' : ''}>
                  <td><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                  <td>
                    <code className="font-mono">{p.plot_number}</code>
                    {viewMode === 'rank' && rankVariable && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>#{rank + 1}</span>
                    )}
                  </td>
                  <td>{p.germplasm_name}</td>
                  <td>{p.rep}</td>
                  <td>{p.is_check ? <span className="badge badge-amber">★ Check</span> : <span className="badge badge-blue">⚡ Test</span>}</td>
                  {viewMode === 'rank' && rankVariable && (
                    <td className="font-mono text-sm">{obsVal != null ? obsVal : '—'}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showArchiveConfirm && (
        <ConfirmDialog
          message={`Archive the ${selectedIds.length} underlying accessions? They will be hidden from default views.`}
          loading={bulkArchiveMutation.isPending}
          onConfirm={() => bulkArchiveMutation.mutate()}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Permanently delete the ${selectedIds.length} underlying accessions? This cannot be undone.`}
          loading={bulkDeleteMutation.isPending}
          onConfirm={() => bulkDeleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showAdvanceSuccessPrompt && (
        <Modal title="Advancement Complete!" onClose={() => setShowAdvanceSuccessPrompt(false)}>
          <p>Successfully advanced and created <strong>{advancedIds.length}</strong> new germplasm entries.</p>
          <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={() => setShowAdvanceSuccessPrompt(false)}>Close</button>
            <button className="btn btn-primary" onClick={() => {
              setShowAdvanceSuccessPrompt(false)
              setShowSendToTrialModal(true)
            }}>Send to New Field</button>
          </div>
        </Modal>
      )}
      {showSendToTrialModal && (
        <SendToTrialModal
          germplasmIds={advancedIds}
          onClose={() => setShowSendToTrialModal(false)}
          onSuccess={() => { setShowSendToTrialModal(false); navigate('/trials') }}
        />
      )}
    </div>
  )
}

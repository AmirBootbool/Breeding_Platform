import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, germplasm, Trial, Plot, ApiError } from '../../api/client'
import Modal from '../Modal'
import ConfirmDialog from '../ConfirmDialog'
import SendToTrialModal from '../SendToTrialModal'

interface AdvancePlotsTabProps {
  trial: Trial
  plotList: Plot[]
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
  const qc = useQueryClient()

  // Get selected germplasm IDs from selected plot IDs
  const getSelectedGermplasmIds = () => {
    return selectedIds
      .map(id => plotList.find(p => p.id === id)?.germplasm)
      .filter((id): id is number => id !== undefined)
  }

  const mutation = useMutation({
    mutationFn: () => trials.advancePlots(trial.id, {
      plot_ids: selectedIds,
      selections_per_plot: parseInt(selectionsPerPlot, 10) || 1,
      selection_method: selectionMethod,
    }),
    onSuccess: (data) => {
      setSuccessMsg('')
      setErrorMsg('')
      setSelectedIds([])
      setAdvancedIds(data.created_ids)
      setShowAdvanceSuccessPrompt(true)
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
      setSuccessMsg('')
    }
  })

  const bulkArchiveMutation = useMutation({
    mutationFn: () => germplasm.bulkArchive(getSelectedGermplasmIds()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['trial', trial.id] })
      setSelectedIds([])
      setShowArchiveConfirm(false)
      setSuccessMsg(`Archived ${res.archived_count} accessions.`)
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => germplasm.bulkDelete(getSelectedGermplasmIds()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['trial', trial.id] })
      setSelectedIds([])
      setShowDeleteConfirm(false)
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

  if (plotList.length === 0) {
    return <div className="empty-state"><p>No plots available to advance.</p></div>
  }

  return (
    <div>
      <div className="card-title mb-4">Advance Selected Plots</div>
      
      {successMsg && <div className="alert alert-success mb-4"><span>✓</span><span>{successMsg}</span></div>}
      {errorMsg && <div className="alert alert-error mb-4"><span>⚠</span><span>{errorMsg}</span></div>}

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
        <div className="flex gap-2">
          <button
            className="btn btn-primary w-full"
            disabled={selectedIds.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Advancing...' : `Advance ${selectedIds.length} Plots`}
          </button>
          <button
            className="btn btn-secondary w-full"
            disabled={selectedIds.length === 0}
            onClick={() => setShowArchiveConfirm(true)}
          >
            Archive {selectedIds.length}
          </button>
          <button
            className="btn btn-secondary w-full"
            style={{ color: 'var(--status-danger)' }}
            disabled={selectedIds.length === 0}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Remove {selectedIds.length}
          </button>
        </div>
      </div>

      <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input type="checkbox" checked={selectedIds.length === plotList.length && plotList.length > 0} onChange={toggleSelectAll} />
              </th>
              <th>Plot #</th>
              <th>Germplasm</th>
              <th>Rep</th>
            </tr>
          </thead>
          <tbody>
            {plotList.map(p => (
              <tr key={p.id} className={selectedIds.includes(p.id) ? 'selected-row' : ''}>
                <td><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                <td><code className="font-mono">{p.plot_number}</code></td>
                <td>{p.germplasm_name}</td>
                <td>{p.rep}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Archive Confirm */}
      {showArchiveConfirm && (
        <ConfirmDialog
          message={`Archive the ${selectedIds.length} underlying accessions? They will be hidden from default views.`}
          loading={bulkArchiveMutation.isPending}
          onConfirm={() => bulkArchiveMutation.mutate()}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      )}

      {/* Bulk Delete Confirm */}
      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Permanently delete the ${selectedIds.length} underlying accessions? WARNING: This cannot be undone and will cascade delete all associated plots in trials.`}
          loading={bulkDeleteMutation.isPending}
          onConfirm={() => bulkDeleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showAdvanceSuccessPrompt && (
        <Modal title="Success!" onClose={() => setShowAdvanceSuccessPrompt(false)}>
          <p>Successfully advanced and created {advancedIds.length} new germplasm entries.</p>
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
          onSuccess={() => {
            setShowSendToTrialModal(false)
            navigate(`/trials`)
          }}
        />
      )}
    </div>
  )
}

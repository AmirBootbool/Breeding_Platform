import React, { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { trials, germplasm, Trial, Germplasm, ApiError } from '../../api/client'
import { DESIGN_TYPE_LABELS } from './types'

interface GenerateLayoutModalProps {
  trial: Trial
  onClose: () => void
  onSuccess: () => void
}

export default function GenerateLayoutModal({ trial, onClose, onSuccess }: GenerateLayoutModalProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [checkIds, setCheckIds] = useState<number[]>([])
  const [seed, setSeed] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [error, setError] = useState<string>('')

  const { data: germplasmData, isLoading } = useQuery({
    queryKey: ['program-germplasm', trial.program],
    queryFn: () => germplasm.list(`&page_size=500&program=${trial.program}`),
  })

  const programGermplasm: Germplasm[] = germplasmData?.results ?? []

  useEffect(() => {
    if (programGermplasm.length > 0 && selectedIds.length === 0) {
      setSelectedIds(programGermplasm.map((g: Germplasm) => g.id))
    }
  }, [programGermplasm])

  const filtered = programGermplasm.filter((g: Germplasm) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.germplasm_db_id.toLowerCase().includes(search.toLowerCase())
  )

  const mutation = useMutation({
    mutationFn: () => trials.createPlots(trial.id, {
      germplasm_ids: selectedIds,
      seed: seed ? Number(seed) : undefined,
      check_germplasm_ids: trial.design_type === 'augmented' ? checkIds : undefined,
    }),
    onSuccess: () => {
      onSuccess()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
    }
  })

  const isAlpha = trial.design_type === 'alpha_lattice' || trial.design_type === 'augmented_block'
  const isAugmented = trial.design_type === 'augmented' || trial.design_type === 'augmented_block' || trial.design_type === 'prep'
  const isLatinSquare = trial.design_type === 'latin_square'
  const blockSize = trial.block_size ?? 1

  const countOk = !isAlpha || (selectedIds.length > 0 && selectedIds.length % blockSize === 0)
  const remainder = isAlpha && selectedIds.length > 0 ? selectedIds.length % blockSize : 0
  
  const latinSquareOk = !isLatinSquare || (selectedIds.length > 0 && selectedIds.length <= 30)

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(programGermplasm.map((g: Germplasm) => g.id))
    } else {
      setSelectedIds([])
      setCheckIds([])
    }
  }

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        setCheckIds(c => c.filter(cid => cid !== id))
        return prev.filter(x => x !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  const handleToggleCheck = (id: number) => {
    setCheckIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  return (
    <>
      {error && <div className="alert alert-error mb-4"><span>⚠</span><span>{error}</span></div>}
      
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <p className="text-sm text-muted">
          Design: <strong>{DESIGN_TYPE_LABELS[trial.design_type] || trial.design_type}</strong>
          {isAlpha && ` (Block Size: ${blockSize})`}
          {isAugmented && trial.design_type !== 'prep' && ` (${trial.num_reps} check replications)`}
          {trial.design_type === 'prep' && ` (Fraction: ${trial.prep_fraction})`}
        </p>
      </div>

      <div className="grid-2 gap-4 mb-4">
        <div className="form-group">
          <label className="form-label">Search Germplasm</label>
          <input className="form-input" placeholder="Search by name or code..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Randomization Seed (Optional)</label>
          <input className="form-input" type="number" placeholder="e.g. 42" value={seed} onChange={e => setSeed(e.target.value)} />
        </div>
      </div>

      {isAlpha && (
        <div className={`alert ${countOk ? 'alert-success' : 'alert-error'} mb-4`}>
          <span>ℹ</span>
          <span>
            Selected entries: <strong>{selectedIds.length}</strong>.
            Block Size is <strong>{blockSize}</strong>.
            {countOk ? ' Divisibility check passed!' : ` Divisibility check failed: Entry count must be divisible by ${blockSize} (current remainder: ${remainder}).`}
          </span>
        </div>
      )}
      
      {isLatinSquare && (
        <div className={`alert ${latinSquareOk ? 'alert-success' : 'alert-error'} mb-4`}>
          <span>ℹ</span>
          <span>
            Selected entries: <strong>{selectedIds.length}</strong>.
            {latinSquareOk ? ' Valid size for Latin Square!' : ' Latin Square requires exactly N entries (max 30) to produce an N×N layout.'}
          </span>
        </div>
      )}

      <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: 'var(--space-4)' }}>
        {isLoading ? (
          <div className="loading-spinner"><div className="spinner" /> Loading program germplasm...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>No germplasm found matching search.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" checked={selectedIds.length === programGermplasm.length && programGermplasm.length > 0} onChange={handleSelectAll} />
                </th>
                <th>Name</th>
                <th>Code</th>
                {isAugmented && <th>Is Check?</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((g: Germplasm) => {
                const isSelected = selectedIds.includes(g.id)
                const isCheck = checkIds.includes(g.id)
                return (
                  <tr key={g.id} className={isSelected ? 'selected-row' : ''}>
                    <td>
                      <input type="checkbox" checked={isSelected} onChange={() => handleToggleSelect(g.id)} />
                    </td>
                    <td>{g.name}</td>
                    <td><code className="font-mono">{g.germplasm_db_id}</code></td>
                    {isAugmented && (
                      <td>
                        <input type="checkbox" disabled={!isSelected} checked={isCheck} onChange={() => handleToggleCheck(g.id)} />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button
          className="btn btn-primary"
          disabled={mutation.isPending || !countOk || !latinSquareOk || selectedIds.length === 0}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : 'Generate Layout'}
        </button>
      </div>
    </>
  )
}

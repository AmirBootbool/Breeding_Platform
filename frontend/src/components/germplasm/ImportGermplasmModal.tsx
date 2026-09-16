import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { germplasm, Program, GermplasmBulkImportResult, ApiError } from '../../api/client'

interface ImportGermplasmModalProps {
  programList: Program[]
  onClose: () => void
  onSuccess?: () => void
}

export default function ImportGermplasmModal({
  programList,
  onClose,
  onSuccess,
}: ImportGermplasmModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [programName, setProgramName] = useState(programList[0]?.name ?? '')
  const [dryRun, setDryRun] = useState(false)
  const [result, setResult] = useState<GermplasmBulkImportResult | null>(null)
  const [error, setError] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Please select a CSV or Excel file to import.')
      if (!programName) throw new Error('Please select a program.')
      return germplasm.bulkImport(file, programName, dryRun)
    },
    onSuccess: (data) => {
      setResult(data)
      setError('')
      if (!dryRun && (!data.errors || data.errors.length === 0)) {
        qc.invalidateQueries({ queryKey: ['germplasm'] })
        qc.invalidateQueries({ queryKey: ['germplasm-all'] })
        if (onSuccess) onSuccess()
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const detail = err.detail
        if (typeof detail === 'object' && detail !== null && 'errors' in detail) {
          setResult(detail as GermplasmBulkImportResult)
        } else {
          setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
        }
      } else {
        setError((err as Error).message)
      }
    },
  })

  function isSupportedFile(name: string) {
    const lower = name.toLowerCase()
    return lower.endsWith('.csv') || lower.endsWith('.xlsx')
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      if (isSupportedFile(droppedFile.name)) {
        setFile(droppedFile)
        setResult(null)
        setError('')
      } else {
        setError('Only .csv or .xlsx files are supported.')
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0]
      setFile(selected)
      setResult(null)
      setError('')
    }
  }

  const hasErrors = (result?.errors?.length ?? 0) > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="text-sm text-muted">
        Bulk-create germplasm accessions from a CSV or Excel file. Required column:{' '}
        <code>name</code>. Optional: <code>species, pedigree_string, cross_type,
        year_developed, notes</code>.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
        <select
          id="import-germplasm-program"
          className="form-input"
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
        >
          {programList.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--brand-400)' : 'var(--border)'}`,
          backgroundColor: isDragging ? 'var(--bg-card-hover)' : 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6)',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>📄</div>
        {file ? (
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--brand-300)' }}>
              {file.name}
            </p>
            <p className="text-xs text-muted">
              {(file.size / 1024).toFixed(1)} KB — Click or drop another file to change
            </p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-sm">
              Click to select or drag and drop a CSV or Excel file here
            </p>
            <p className="text-xs text-muted mt-1">
              Columns: name (required), species, pedigree_string, cross_type,
              year_developed, notes
            </p>
          </div>
        )}
      </div>

      {/* Dry Run Toggle */}
      <div className="flex items-center gap-2 mt-1">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
          />
          <span><strong>Validate Only (Dry Run)</strong> — check rows without saving</span>
        </label>
      </div>

      {/* Result Display */}
      {result && !hasErrors && (
        <div className={`alert ${dryRun ? 'alert-info' : 'alert-success'}`}>
          <span>✓</span>
          <div>
            <strong>
              {dryRun ? 'Dry Run Validation Passed!' : 'Germplasm Imported Successfully!'}
            </strong>
            <p className="text-xs mt-1">
              {dryRun
                ? `Ready to create ${result.skipped > 0 ? `new accessions (${result.skipped} duplicate name(s) will be skipped)` : 'the accessions in this file'}.`
                : `Created ${result.created} accession(s)${result.skipped > 0 ? `, skipped ${result.skipped} duplicate(s)` : ''}.`}
            </p>
          </div>
        </div>
      )}

      {/* Error Details */}
      {hasErrors && (
        <div className="alert alert-error" style={{ display: 'block' }}>
          <div className="flex items-center gap-2 font-semibold">
            <span>⚠</span>
            <span>Import failed with {result?.errors.length} error(s). No accessions were saved.</span>
          </div>
          <div
            className="table-container mt-3"
            style={{ maxHeight: '180px', overflowY: 'auto', background: 'var(--bg-main)' }}
          >
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Row</th>
                  <th>Error Detail</th>
                </tr>
              </thead>
              <tbody>
                {result?.errors.map((err, idx) => (
                  <tr key={idx}>
                    <td>{err.row > 0 ? `Row ${err.row}` : 'File'}</td>
                    <td>{String(err.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Footer */}
      <div className="modal-footer">
        <button
          className="btn btn-secondary"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          {result && !dryRun && !hasErrors ? 'Done' : 'Cancel'}
        </button>
        <button
          id="import-germplasm-submit-btn"
          className="btn btn-primary"
          disabled={!file || !programName || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14 }} />
              {dryRun ? 'Validating…' : 'Importing…'}
            </>
          ) : dryRun ? (
            'Validate File'
          ) : (
            '📥 Upload & Import'
          )}
        </button>
      </div>
    </div>
  )
}

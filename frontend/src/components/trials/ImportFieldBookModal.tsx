import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, Trial, FieldBookImportResult, ApiError } from '../../api/client'

interface ImportFieldBookModalProps {
  trial: Trial
  onClose: () => void
  onSuccess?: () => void
}

export default function ImportFieldBookModal({
  trial,
  onClose,
  onSuccess,
}: ImportFieldBookModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState(false)
  const [result, setResult] = useState<FieldBookImportResult | null>(null)
  const [error, setError] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Please select a CSV file to import.')
      return trials.importFieldBook(trial.id, file, dryRun)
    },
    onSuccess: (data) => {
      setResult(data)
      setError('')
      if (!data.dry_run && (!data.errors || data.errors.length === 0)) {
        qc.invalidateQueries({ queryKey: ['observations-for-trial', trial.id] })
        qc.invalidateQueries({ queryKey: ['trial-summary', trial.id] })
        qc.invalidateQueries({ queryKey: ['observations'] })
        if (onSuccess) onSuccess()
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const detail = err.detail
        if (typeof detail === 'object' && detail !== null && 'errors' in detail) {
          const resObj = detail as FieldBookImportResult
          setResult(resObj)
        } else if (Array.isArray(detail)) {
          setResult({
            imported_count: 0,
            updated_count: 0,
            matched_variables: [],
            errors: detail,
            dry_run: dryRun,
          })
        } else {
          setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
        }
      } else {
        setError((err as Error).message)
      }
    },
  })

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.name.toLowerCase().endsWith('.csv')) {
        setFile(droppedFile)
        setResult(null)
        setError('')
      } else {
        setError('Only .csv files are supported.')
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
        Upload observation scores from your tablet or Field Book Android app for trial{' '}
        <strong style={{ color: 'var(--text-main)' }}>{trial.trial_code}</strong>.
      </p>

      {error && (
        <div className="alert alert-error">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

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
          accept=".csv"
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
              {(file.size / 1024).toFixed(1)} KB — Click or drop another CSV to change
            </p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-sm">
              Click to select or drag and drop Field Book CSV here
            </p>
            <p className="text-xs text-muted mt-1">
              Supports standard Field Book format with plot/plot_id and trait columns
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
          <span><strong>Dry Run (Validate Only)</strong> — check CSV headers, plots, and values without saving</span>
        </label>
      </div>

      {/* Result Display */}
      {result && !hasErrors && (
        <div className={`alert ${result.dry_run ? 'alert-info' : 'alert-success'}`}>
          <span>✓</span>
          <div>
            <strong>
              {result.dry_run ? 'Dry Run Validation Passed!' : 'Field Book Imported Successfully!'}
            </strong>
            <p className="text-xs mt-1">
              {result.dry_run
                ? `Ready to import ${result.imported_count + result.updated_count} observations.`
                : `Created ${result.imported_count} new and updated ${result.updated_count} existing observations.`}
            </p>
            {result.matched_variables.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 items-center">
                <span className="text-xs font-semibold">Matched Traits:</span>
                {result.matched_variables.map((v) => (
                  <span
                    key={v}
                    className="badge badge-neutral"
                    style={{ fontSize: '0.75rem' }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Details */}
      {hasErrors && (
        <div className="alert alert-error" style={{ display: 'block' }}>
          <div className="flex items-center gap-2 font-semibold">
            <span>⚠</span>
            <span>Import failed with {result?.errors.length} error(s). All database changes were rolled back.</span>
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
                    <td>
                      {typeof err.detail === 'object'
                        ? JSON.stringify(err.detail)
                        : String(err.detail)}
                    </td>
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
          {result && !result.dry_run && !hasErrors ? 'Done' : 'Cancel'}
        </button>
        <button
          id="import-fieldbook-submit-btn"
          className="btn btn-primary"
          disabled={!file || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14 }} />
              {dryRun ? 'Validating…' : 'Importing…'}
            </>
          ) : dryRun ? (
            'Validate CSV'
          ) : (
            '📥 Upload & Import'
          )}
        </button>
      </div>
    </div>
  )
}

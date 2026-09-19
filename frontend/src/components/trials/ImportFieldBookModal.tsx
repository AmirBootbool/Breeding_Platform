import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trials, observationVariables, Trial, FieldBookImportResult, ApiError } from '../../api/client'
import { useToast } from '../common/ToastProvider'
import { useNotificationStore } from '../../store/notificationStore'

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
  const [allowPartial, setAllowPartial] = useState(false)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [result, setResult] = useState<FieldBookImportResult | null>(null)
  const [error, setError] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { showToast } = useToast()
  const pushNotification = useNotificationStore((s) => s.push)
  const qc = useQueryClient()

  const { data: variablesData } = useQuery({
    queryKey: ['observation-variables'],
    queryFn: () => observationVariables.list(),
  })
  const variableList = variablesData?.results ?? []

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Please select a CSV file to import.')
      return trials.importFieldBook(trial.id, file, dryRun, allowPartial, columnMapping)
    },
    onSuccess: (data) => {
      setResult(data)
      setError('')
      const hasErrors = data.errors && data.errors.length > 0
      if (!data.dry_run) {
        showToast(
          `Field Book import completed: ${data.imported_count} imported, ${data.updated_count} updated${hasErrors ? `, ${data.errors.length} errors` : ''}.`,
          hasErrors ? 'error' : 'success'
        )
        pushNotification({
          title: `Field Book Import (${trial.name})`,
          text: `Imported ${data.imported_count} and updated ${data.updated_count} observations.`,
          kind: 'import',
        })
        if (!hasErrors) {
          qc.invalidateQueries({ queryKey: ['observations-for-trial', trial.id] })
          qc.invalidateQueries({ queryKey: ['trial-summary', trial.id] })
          qc.invalidateQueries({ queryKey: ['observations'] })
          if (onSuccess) onSuccess()
        }
      } else {
        showToast(`Dry run finished: ${data.imported_count} rows ready.`, 'info')
      }
    },
    onError: (err) => {
      showToast(`Field book import failed: ${(err as Error).message}`, 'error')
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
      const lower = droppedFile.name.toLowerCase()
      if (lower.endsWith('.csv') || lower.endsWith('.xlsx')) {
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
              Click to select or drag and drop a Field Book CSV or Excel file here
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
      <div className="flex items-center gap-2 mt-1">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={allowPartial}
            disabled={dryRun}
            onChange={(e) => setAllowPartial(e.target.checked)}
          />
          <span><strong>Import valid rows even if some rows have errors</strong> — otherwise the whole file is rejected together</span>
        </label>
      </div>

      {/* Column Mapping Section if Unmatched Columns exist */}
      {result?.unmatched_columns && result.unmatched_columns.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--amber-400)', padding: 'var(--space-3)', background: 'var(--bg-card)' }}>
          <div className="flex items-center justify-between mb-2">
            <strong className="text-sm" style={{ color: 'var(--amber-400)' }}>
              ⚠️ Unmatched Columns ({result.unmatched_columns.length})
            </strong>
            <span className="text-xs text-muted">
              Map CSV headers to database observation variables:
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {result.unmatched_columns.map((colName) => (
              <div key={colName} className="flex items-center justify-between gap-3 text-xs">
                <span className="font-mono font-semibold" style={{ minWidth: 140 }}>{colName}</span>
                <span>➔</span>
                <select
                  className="form-input text-xs"
                  style={{ flex: 1 }}
                  value={columnMapping[colName] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setColumnMapping((prev) => ({ ...prev, [colName]: val }))
                  }}
                >
                  <option value="">— Skip Column —</option>
                  {variableList.map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name} ({v.data_type})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <span>
              {(result?.imported_count || result?.updated_count)
                ? `Imported ${result?.imported_count} and updated ${result?.updated_count} rows; ${result?.errors.length} row(s) had errors and were skipped.`
                : `Import failed with ${result?.errors.length} error(s). All database changes were rolled back.`}
            </span>
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

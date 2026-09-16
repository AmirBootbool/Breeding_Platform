import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { trials, Trial } from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'

function DownloadButton({
  id,
  label,
  url,
  icon,
  format,
}: {
  id: string
  label: string
  url: string
  icon: string
  format: 'csv' | 'xlsx'
}) {
  const token = useAuthStore(s => s.token)

  async function handleDownload() {
    // Use fetch with auth header, then trigger blob download
    const separator = url.includes('?') ? '&' : '?'
    const fullUrl = format === 'xlsx' ? `${url}${separator}output_format=xlsx` : url
    const res = await fetch(fullUrl, {
      headers: { Authorization: `Token ${token}` },
    })
    if (!res.ok) {
      alert(`Download failed: ${res.status}`)
      return
    }
    const disposition = res.headers.get('Content-Disposition') ?? ''
    const match = disposition.match(/filename="(.+)"/)
    const filename = match?.[1] ?? 'export.csv'

    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <button id={id} className="btn btn-primary" onClick={handleDownload}>
      {icon} {label}
    </button>
  )
}

export default function DataExport() {
  const [selectedTrial, setSelectedTrial] = useState<Trial | null>(null)
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv')

  const { data: trialsData, isLoading } = useQuery({
    queryKey: ['trials-export'],
    queryFn: () => trials.list(),
  })

  return (
    <div className="page-shell">
      <TopBar
        title="Data Export"
        subtitle="Download trial data as CSV or Field Book format"
      />

      <div style={{ maxWidth: 640 }}>
        <div className="card mb-6">
          <div className="card-title">Select Trial</div>
          <p className="text-sm text-muted mb-4">
            Choose a trial to export its observations or Field Book layout.
          </p>
          {isLoading ? (
            <div className="loading-spinner" style={{ padding: 'var(--space-4)' }}>
              <div className="spinner" />
            </div>
          ) : (
            <select
              id="export-trial-select"
              className="form-input"
              value={selectedTrial?.id ?? ''}
              onChange={e => {
                const t = trialsData?.results.find(x => x.id === Number(e.target.value)) ?? null
                setSelectedTrial(t)
              }}
            >
              <option value="">— Choose trial —</option>
              {trialsData?.results.map(t => (
                <option key={t.id} value={t.id}>
                  {t.trial_code} — {t.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedTrial && (
          <div className="card fade-in">
            <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              {selectedTrial.trial_code} — {selectedTrial.name}
            </div>
            <p className="text-sm text-muted mb-6">
              {selectedTrial.plot_count} plots · {selectedTrial.program_name} ·{' '}
              {selectedTrial.season_name}
            </p>

            <div className="flex items-center gap-2 mb-6">
              <span className="text-sm font-semibold">File format:</span>
              <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-default)' }}>
                <button
                  id="export-format-csv"
                  className={`btn btn-sm ${format === 'csv' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 0, padding: '4px 12px' }}
                  onClick={() => setFormat('csv')}
                >
                  CSV
                </button>
                <button
                  id="export-format-xlsx"
                  className={`btn btn-sm ${format === 'xlsx' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 0, padding: '4px 12px' }}
                  onClick={() => setFormat('xlsx')}
                >
                  Excel
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Observations */}
              <div className="card" style={{ background: 'var(--bg-elevated)' }}>
                <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  📄 Observations
                </div>
                <p className="text-sm text-muted mb-4">
                  All recorded observations for this trial: plot number, germplasm,
                  rep, trait, value, and timestamp.
                </p>
                <DownloadButton
                  id="download-obs-csv"
                  label={`Download Observations ${format === 'xlsx' ? 'Excel' : 'CSV'}`}
                  url={`/api/trials/${selectedTrial.id}/export_csv/`}
                  icon="⬇"
                  format={format}
                />
              </div>

              {/* Field Book */}
              <div className="card" style={{ background: 'var(--bg-elevated)' }}>
                <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  📱 Field Book
                </div>
                <p className="text-sm text-muted mb-4">
                  Plot layout in Field Book Android app format: plot_id, range,
                  plot, entry, and empty trait columns.
                </p>
                <DownloadButton
                  id="download-fieldbook-csv"
                  label={`Download Field Book ${format === 'xlsx' ? 'Excel' : 'CSV'}`}
                  url={`/api/trials/${selectedTrial.id}/export_fieldbook/`}
                  icon="⬇"
                  format={format}
                />
              </div>
            </div>
          </div>
        )}

        {!selectedTrial && !isLoading && (
          <div className="empty-state">
            <div className="empty-icon">⬇</div>
            <p>Select a trial above to see export options.</p>
          </div>
        )}
      </div>
    </div>
  )
}

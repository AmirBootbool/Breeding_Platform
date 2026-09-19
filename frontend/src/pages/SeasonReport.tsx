import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { seasons } from '../api/client'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import { useToast } from '../components/common/ToastProvider'

export default function SeasonReport() {
  const { seasonId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['season-summary', seasonId],
    queryFn: () => seasons.getSummary(Number(seasonId)),
    enabled: !!seasonId,
  })

  const handleCreateShareLink = async () => {
    if (!seasonId) return
    setIsSharing(true)
    try {
      const res = await seasons.createShareLink(Number(seasonId), 30)
      setShareToken(res.token)
    } catch {
      showToast('Failed to generate share link.', 'error')
    } finally {
      setIsSharing(false)
    }
  }

  if (isLoading || !data) {
    return <div className="page-shell"><div className="loading-spinner"><div className="spinner" /> Loading…</div></div>
  }

  const shareUrl = shareToken ? `${window.location.origin}/shared/${shareToken}` : ''

  return (
    <div className="page-shell">
      <TopBar
        title={`Season Report — ${data.season_name} (${data.year})`}
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => navigate('/trials')}>← Back</button>
            <button className="btn btn-secondary" onClick={handleCreateShareLink} disabled={isSharing}>
              🔗 Share Link
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>🖨 Print / Save PDF</button>
          </div>
        }
      />
      <div className="card mb-6">
        <div className="card-title">Overview</div>
        <p>{data.trial_count} trial(s), {data.cross_count} cross(es) planned this season.</p>
        <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
          {Object.entries(data.cross_counts_by_status).map(([statusKey, count]) => (
            <span key={statusKey} className="badge badge-gray">{statusKey}: {count}</span>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Trials</div>
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Location</th><th>Design</th><th>Status</th><th>Plots</th></tr>
          </thead>
          <tbody>
            {data.trials.map(t => (
              <tr key={t.trial_code}>
                <td>{t.trial_code}</td><td>{t.name}</td><td>{t.location_name ?? '—'}</td>
                <td>{t.design_type}</td><td>{t.status}</td><td>{t.plot_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shareToken && (
        <Modal title="Shareable Read-Only Report Link" onClose={() => setShareToken(null)}>
          <p className="text-sm text-muted mb-3">
            Anyone with this link can view a read-only overview of this season report without logging in. Link expires in 30 days.
          </p>
          <div className="form-group">
            <label className="form-label">Public Link</label>
            <div className="flex gap-2">
              <input
                className="form-input font-mono text-sm"
                readOnly
                value={shareUrl}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl)
                  showToast('Link copied to clipboard!', 'success')
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

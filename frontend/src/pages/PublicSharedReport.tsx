import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { publicShared } from '../api/client'

export default function PublicSharedReport() {
  const { token } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-shared-season', token],
    queryFn: () => publicShared.getSeasonSummary(token!),
    enabled: !!token,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="page-shell" style={{ maxWidth: 800, margin: '40px auto', padding: 'var(--space-4)' }}>
        <div className="loading-spinner"><div className="spinner" /> Loading shared report…</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="page-shell" style={{ maxWidth: 800, margin: '40px auto', padding: 'var(--space-4)' }}>
        <div className="alert alert-error">
          <span>⚠</span>
          <span>This shared link is invalid or has expired.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell" style={{ maxWidth: 900, margin: '30px auto', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Season Report — {data.season_name} ({data.year})</h1>
          <p className="text-sm text-muted">Shared Read-Only Summary</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>🖨 Print / Save PDF</button>
      </div>

      <div className="card mb-4">
        <div className="card-title">Overview</div>
        <p>{data.trial_count} trial(s), {data.cross_count} cross(es) planned in this season.</p>
      </div>

      <div className="card">
        <div className="card-title">Trials ({data.trials.length})</div>
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Status</th><th>Plots</th></tr>
          </thead>
          <tbody>
            {data.trials.map(t => (
              <tr key={t.trial_code}>
                <td>{t.trial_code}</td><td>{t.name}</td><td>{t.status}</td><td>{t.plot_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

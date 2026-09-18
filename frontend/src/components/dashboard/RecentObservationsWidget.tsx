import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart2 } from 'lucide-react'
import { observations, Observation } from '../../api/client'

export default function RecentObservationsWidget() {
  const navigate = useNavigate()

  const { data: recentObs, isLoading } = useQuery({
    queryKey: ['recent-observations'],
    queryFn: () => observations.list('&ordering=-created_at&page_size=8'),
  })

  const obsList: Observation[] = recentObs?.results ?? []

  return (
    <section className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-brand-400" />
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Recent Field Observations
          </h2>
        </div>
        <button
          className="btn btn-ghost btn-sm text-xs"
          onClick={() => navigate('/observations')}
        >
          Observation Entry →
        </button>
      </div>

      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading observations…</div>
      ) : obsList.length === 0 ? (
        <p className="text-muted text-sm">No observations recorded yet.</p>
      ) : (
        <div className="table-container" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)' }}>
          <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 10px' }}>Variable</th>
                <th style={{ padding: '6px 10px' }}>Value</th>
                <th style={{ padding: '6px 10px' }}>Plot</th>
                <th style={{ padding: '6px 10px' }}>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {obsList.map(obs => (
                <tr key={obs.id}>
                  <td style={{ padding: '6px 10px' }}><strong>{obs.variable_name}</strong></td>
                  <td className="font-mono" style={{ padding: '6px 10px', color: 'var(--brand-300)' }}>
                    {obs.value_numeric ?? obs.value_text ?? obs.value_date ?? '—'}
                  </td>
                  <td style={{ padding: '6px 10px' }}>Plot #{obs.plot}</td>
                  <td style={{ padding: '6px 10px' }} className="text-muted text-xs">
                    {obs.observation_time ? new Date(obs.observation_time).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

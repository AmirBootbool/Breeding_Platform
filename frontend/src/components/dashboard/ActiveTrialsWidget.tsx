import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { trials, Trial } from '../../api/client'
import { useUiStore } from '../../store/uiStore'

export default function ActiveTrialsWidget() {
  const navigate = useNavigate()
  const selectedProgramId = useUiStore((s) => s.activeProgramId)

  const { data: trialsData, isLoading } = useQuery({
    queryKey: ['active-trials-widget', selectedProgramId],
    queryFn: () => trials.list(
      (selectedProgramId ? `&program=${selectedProgramId}` : '') + '&status=active&page_size=6'
    ),
  })

  const trialList: Trial[] = trialsData?.results ?? []

  return (
    <section className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          🧪 Active Field Trials
        </h2>
        <button
          className="btn btn-ghost btn-sm text-xs"
          onClick={() => navigate('/trials')}
        >
          View all →
        </button>
      </div>

      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading trials…</div>
      ) : trialList.length === 0 ? (
        <p className="text-muted text-sm">No active trials found.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
          {trialList.map((t) => (
            <div
              key={t.id}
              className="card hover-row"
              style={{ padding: 'var(--space-3)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
              onClick={() => navigate('/trials')}
            >
              <div className="font-semibold text-sm">{t.name}</div>
              <div className="text-xs text-muted flex items-center justify-between">
                <span>{t.design_type || 'Field Trial'}</span>
                <span className="badge badge-green text-xs">{t.status}</span>
              </div>
              <div className="text-xs text-muted">
                {t.location_name} · {t.season_name}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

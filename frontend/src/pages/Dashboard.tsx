import { useQuery } from '@tanstack/react-query'
import { programs, germplasm, trials, observations } from '../api/client'
import TopBar from '../components/TopBar'

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="stat-card fade-in">
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function ProgramCard({ program }: { program: { id: number; name: string; crop: string; description: string } }) {
  return (
    <div className="card fade-in" style={{ cursor: 'default' }}>
      <div className="flex items-center gap-3 mb-4">
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--r-md)',
          background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.2rem', flexShrink: 0
        }}>🌾</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{program.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{program.crop}</div>
        </div>
      </div>
      {program.description && (
        <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {program.description}
        </p>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { data: programsData, isLoading: pLoading } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })

  const { data: germplasmData } = useQuery({
    queryKey: ['germplasm-count'],
    queryFn: () => germplasm.list('&page_size=1'),
  })

  const { data: trialsData } = useQuery({
    queryKey: ['trials-count'],
    queryFn: () => trials.list('&page_size=1'),
  })

  const { data: recentObs } = useQuery({
    queryKey: ['recent-observations'],
    queryFn: () => observations.list('&ordering=-created_at&page_size=8'),
  })

  return (
    <div className="page-shell">
      <TopBar
        title="Dashboard"
        subtitle="Overview of your wheat breeding programs"
      />

      {/* Stats strip */}
      <div className="grid-4 mb-8">
        <StatCard label="Programs" value={programsData?.count ?? '—'} icon="🗂" sub="Active programs" />
        <StatCard label="Germplasm" value={germplasmData?.count ?? '—'} icon="🌱" sub="Registered entries" />
        <StatCard label="Trials" value={trialsData?.count ?? '—'} icon="🧪" sub="Total trials" />
        <StatCard label="Observations" value={recentObs?.count ?? '—'} icon="📊" sub="Total recorded" />
      </div>

      {/* Programs grid */}
      <section className="mb-8">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)' }}>
          Breeding Programs
        </h2>
        {pLoading ? (
          <div className="loading-spinner"><div className="spinner" /> Loading programs…</div>
        ) : programsData?.results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🌾</div>
            <p>No programs yet. Create one via the Admin panel.</p>
          </div>
        ) : (
          <div className="grid-3">
            {programsData?.results.map(p => <ProgramCard key={p.id} program={p} />)}
          </div>
        )}
      </section>

      {/* Recent observations */}
      <section>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)' }}>
          Recent Observations
        </h2>
        {recentObs?.results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>No observations recorded yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Value</th>
                  <th>Plot</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {recentObs?.results.map(obs => (
                  <tr key={obs.id}>
                    <td><strong>{obs.variable_name}</strong></td>
                    <td className="font-mono">
                      {obs.value_numeric ?? obs.value_text ?? obs.value_date ?? '—'}
                    </td>
                    <td>Plot {obs.plot}</td>
                    <td className="text-muted text-sm">
                      {obs.observation_time
                        ? new Date(obs.observation_time).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

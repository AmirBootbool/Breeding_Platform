import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { programs, germplasm, trials, observations } from '../api/client'
import TopBar from '../components/TopBar'
import { useNavigate } from 'react-router-dom'

const GEN_LABELS: Record<number, string> = {
  0: 'F0', 1: 'F1', 2: 'F2', 3: 'F3', 4: 'F4',
  5: 'F5', 6: 'F6', 7: 'F7', 8: 'F8+',
}

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string | number; sub?: string; icon: string; accent?: string
}) {
  return (
    <div className="stat-card fade-in" style={accent ? { borderTop: `3px solid ${accent}` } : {}}>
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
  const navigate = useNavigate()
  const [selectedProgramId, setSelectedProgramId] = useState<number | ''>('')

  const { data: programsData, isLoading: pLoading } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })

  const { data: germplasmData } = useQuery({
    queryKey: ['germplasm-count', selectedProgramId],
    queryFn: () => germplasm.list(selectedProgramId ? `&program=${selectedProgramId}&page_size=1` : '&page_size=1'),
  })

  const { data: trialsData } = useQuery({
    queryKey: ['trials-count', selectedProgramId],
    queryFn: () => trials.list(selectedProgramId ? `&program=${selectedProgramId}&page_size=1` : '&page_size=1'),
  })

  const { data: recentObs } = useQuery({
    queryKey: ['recent-observations'],
    queryFn: () => observations.list('&ordering=-created_at&page_size=10'),
  })

  // Pipeline: trials grouped by generation
  const { data: allTrials } = useQuery({
    queryKey: ['trials-pipeline', selectedProgramId],
    queryFn: () => trials.list(
      (selectedProgramId ? `&program=${selectedProgramId}` : '') + '&page_size=200&status=active'
    ),
  })

  const pipeline = useMemo(() => {
    const counts: Record<number, number> = {}
    allTrials?.results?.forEach(t => {
      if (t.generation != null) {
        counts[t.generation] = (counts[t.generation] ?? 0) + 1
      }
    })
    return Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b))
  }, [allTrials])

  const maxPipelineCount = Math.max(...pipeline.map(([, c]) => c), 1)

  const programList = programsData?.results ?? []
  const filteredPrograms = selectedProgramId
    ? programList.filter(p => p.id === selectedProgramId)
    : programList

  return (
    <div className="page-shell">
      <TopBar
        title="Dashboard"
        subtitle="Overview of your wheat breeding programs"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <select
              className="form-input"
              style={{ width: 180, fontSize: '0.85rem' }}
              value={selectedProgramId}
              onChange={e => setSelectedProgramId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">All programs</option>
              {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid-4 mb-8">
        <StatCard label="Programs" value={programsData?.count ?? '—'} icon="🗂" sub="Active programs" accent="hsl(142,52%,44%)" />
        <StatCard label="Germplasm" value={germplasmData?.count ?? '—'} icon="🌱" sub="Registered entries" accent="hsl(210,70%,60%)" />
        <StatCard label="Trials" value={trialsData?.count ?? '—'} icon="🧪" sub="Total trials" accent="hsl(45,90%,55%)" />
        <StatCard label="Observations" value={recentObs?.count ?? '—'} icon="📊" sub="Total recorded" accent="hsl(280,55%,60%)" />
      </div>

      {/* Pipeline progress widget */}
      {pipeline.length > 0 && (
        <section className="card mb-8">
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            🌾 Breeding Pipeline — Active Trials by Generation
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 'var(--space-2)' }}>
            {pipeline.map(([gen, count]) => (
              <div key={gen} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', flex: '0 0 auto' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-300)' }}>{count}</div>
                <div style={{
                  width: 48,
                  height: Math.max(24, (count / maxPipelineCount) * 100),
                  background: 'linear-gradient(180deg, var(--brand-400), var(--brand-700))',
                  borderRadius: '6px 6px 0 0',
                  transition: 'height 0.4s ease',
                }} />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {GEN_LABELS[Number(gen)] ?? `F${gen}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="mb-8">
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ⚡ Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {[
            { label: '+ New Trial', path: '/trials', icon: '🧪', color: 'var(--brand-500)' },
            { label: '+ Add Germplasm', path: '/germplasm', icon: '🌱', color: 'hsl(210,70%,60%)' },
            { label: '📋 Open Crossing Block', path: '/crossing', icon: '✕', color: 'hsl(45,90%,55%)' },
            { label: '📦 Seed Inventory', path: '/seed-inventory', icon: '📦', color: 'hsl(280,55%,60%)' },
          ].map(a => (
            <button
              key={a.path}
              className="btn btn-secondary"
              style={{ gap: 6, border: `1px solid ${a.color}33`, background: `${a.color}11` }}
              onClick={() => navigate(a.path)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      {/* Programs grid */}
      <section className="mb-8">
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Breeding Programs
        </h2>
        {pLoading ? (
          <div className="loading-spinner"><div className="spinner" /> Loading programs…</div>
        ) : filteredPrograms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🌾</div>
            <p>No programs yet. Create one via the Admin panel.</p>
          </div>
        ) : (
          <div className="grid-3">
            {filteredPrograms.map(p => <ProgramCard key={p.id} program={p} />)}
          </div>
        )}
      </section>

      {/* Recent observations */}
      <section>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
                    <td className="font-mono">{obs.value_numeric ?? obs.value_text ?? obs.value_date ?? '—'}</td>
                    <td>Plot {obs.plot}</td>
                    <td className="text-muted text-sm">
                      {obs.observation_time ? new Date(obs.observation_time).toLocaleDateString() : '—'}
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

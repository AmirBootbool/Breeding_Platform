import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { programs, germplasm, trials, observations, seedLots, crossingBlocks } from '../api/client'
import TopBar from '../components/TopBar'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../store/uiStore'

const GEN_LABELS: Record<number, string> = {
  0: 'F0 (P)', 1: 'F1', 2: 'F2', 3: 'F3', 4: 'F4',
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
    <div className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: '1.2rem' }}>🌾</span>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{program.name}</div>
        <span className="badge badge-green" style={{ marginLeft: 'auto' }}>{program.crop}</span>
      </div>
      {program.description && (
        <p className="text-secondary text-sm" style={{ margin: 0 }}>{program.description}</p>
      )}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const activeProgramId = useUiStore((s) => s.activeProgramId)
  const selectedProgramId = activeProgramId

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

  const { data: lowStockLots } = useQuery({
    queryKey: ['low-stock-dashboard'],
    queryFn: () => seedLots.getLowStock(50.0),
  })

  const { data: crossingBlocksData } = useQuery({
    queryKey: ['crossing-blocks-dashboard'],
    queryFn: () => crossingBlocks.list(),
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

  const pendingTasks = useMemo(() => {
    const tasks: { icon: string; title: string; desc: string; actionText: string; path: string; severity: 'warning' | 'info' }[] = []
    
    if (lowStockLots && lowStockLots.length > 0) {
      tasks.push({
        icon: '⚠️',
        title: `${lowStockLots.length} Seed Lot(s) Low on Stock (< 50g)`,
        desc: `Vault packets like ${lowStockLots[0].lot_code} (${lowStockLots[0].germplasm_name}) need replenishment or multiplication.`,
        actionText: 'Manage Seed Vault',
        path: '/seed-inventory',
        severity: 'warning',
      })
    }

    const activeBlocksWithCrosses = (crossingBlocksData?.results ?? []).filter(b => b.cross_count > 0)
    if (activeBlocksWithCrosses.length > 0) {
      tasks.push({
        icon: '✂️',
        title: `${activeBlocksWithCrosses.length} Active Crossing Block(s) Ready`,
        desc: `Crosses in "${activeBlocksWithCrosses[0].name}" are in progress or ready for pollination/harvest execution.`,
        actionText: 'Review Crossing Block',
        path: '/crossing',
        severity: 'info',
      })
    }

    return tasks
  }, [lowStockLots, crossingBlocksData])

  return (
    <div className="page-shell">
      <TopBar
        title="Dashboard"
        subtitle="Overview of your wheat breeding programs and active operations"
      />

      {/* Actionable Pending Tasks Banner */}
      {pendingTasks.length > 0 && (
        <section className="mb-6" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {pendingTasks.map((task, idx) => (
            <div
              key={idx}
              className={`alert ${task.severity === 'warning' ? 'alert-warning' : 'alert-info'} slide-in`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: '1.3rem' }}>{task.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{task.title}</div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{task.desc}</div>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ background: 'var(--bg-card)', fontWeight: 600 }}
                onClick={() => navigate(task.path)}
              >
                {task.actionText} →
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Stats strip */}
      <div className="grid-4 mb-8">
        <StatCard label="Programs" value={programsData?.count ?? '—'} icon="🗂" sub="Active breeding scopes" accent="hsl(142,52%,44%)" />
        <StatCard label="Germplasm" value={germplasmData?.count ?? '—'} icon="🌱" sub="Registered accessions" accent="hsl(210,70%,60%)" />
        <StatCard label="Trials" value={trialsData?.count ?? '—'} icon="🧪" sub="Active & past trials" accent="hsl(45,90%,55%)" />
        <StatCard label="Observations" value={recentObs?.count ?? '—'} icon="📊" sub="Data points recorded" accent="hsl(280,55%,60%)" />
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
                  width: 52,
                  height: Math.max(28, (count / maxPipelineCount) * 110),
                  background: 'linear-gradient(180deg, var(--brand-400), var(--brand-700))',
                  borderRadius: '6px 6px 0 0',
                  transition: 'height 0.4s ease',
                  boxShadow: '0 2px 8px rgba(74, 222, 128, 0.2)',
                }} />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
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
          ⚡ Quick Operations
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {[
            { label: '+ New Trial', path: '/trials', icon: '🧪', color: 'var(--brand-500)' },
            { label: '+ Add Germplasm', path: '/germplasm', icon: '🌱', color: 'hsl(210,70%,60%)' },
            { label: '✂️ Crossing Block', path: '/crossing', icon: '✂️', color: 'hsl(45,90%,55%)' },
            { label: '📦 Seed Inventory & Barcodes', path: '/seed-inventory', icon: '📦', color: 'hsl(280,55%,60%)' },
            { label: '🏷️ Trait & Variable Library', path: '/traits', icon: '🏷️', color: 'hsl(180,60%,50%)' },
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

      {/* Recent Activity / Observations Feed */}
      <section>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Recent Field Observations
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
                    <td className="font-mono" style={{ color: 'var(--brand-300)' }}>
                      {obs.value_numeric ?? obs.value_text ?? obs.value_date ?? '—'}
                    </td>
                    <td>Plot #{obs.plot}</td>
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

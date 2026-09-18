import { useQuery } from '@tanstack/react-query'
import { programs, Program } from '../../api/client'
import { useUiStore } from '../../store/uiStore'

export default function BreedingProgramsWidget() {
  const selectedProgramId = useUiStore((s) => s.activeProgramId)

  const { data: programsData, isLoading } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })

  const programList: Program[] = programsData?.results ?? []
  const filteredPrograms = selectedProgramId
    ? programList.filter(p => p.id === selectedProgramId)
    : programList

  return (
    <section className="mb-6">
      <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Breeding Programs
      </h2>
      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading programs…</div>
      ) : filteredPrograms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🌾</div>
          <p>No programs yet. Create one via the Admin panel.</p>
        </div>
      ) : (
        <div className="grid-3">
          {filteredPrograms.map(p => (
            <div key={p.id} className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: '1.2rem' }}>🌾</span>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</div>
                <span className="badge badge-green" style={{ marginLeft: 'auto' }}>{p.crop}</span>
              </div>
              {p.description && (
                <p className="text-secondary text-sm" style={{ margin: 0 }}>{p.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

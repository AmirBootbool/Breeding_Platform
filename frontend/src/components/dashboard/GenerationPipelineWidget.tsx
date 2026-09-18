import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { trials } from '../../api/client'
import { useUiStore } from '../../store/uiStore'

const GEN_LABELS: Record<number, string> = {
  0: 'F0 (P)', 1: 'F1', 2: 'F2', 3: 'F3', 4: 'F4',
  5: 'F5', 6: 'F6', 7: 'F7', 8: 'F8+',
}

export default function GenerationPipelineWidget() {
  const selectedProgramId = useUiStore((s) => s.activeProgramId)

  const { data: allTrials, isLoading } = useQuery({
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

  return (
    <section className="card mb-6">
      <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        🌾 Breeding Pipeline — Active Trials by Generation
      </h2>
      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading pipeline…</div>
      ) : pipeline.length === 0 ? (
        <p className="text-muted text-sm">No active trials found in the current pipeline.</p>
      ) : (
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
      )}
    </section>
  )
}

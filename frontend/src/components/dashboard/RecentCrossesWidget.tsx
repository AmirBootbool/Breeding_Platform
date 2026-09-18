import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Scissors } from 'lucide-react'
import { crossingBlocks, CrossingBlock } from '../../api/client'

export default function RecentCrossesWidget() {
  const navigate = useNavigate()

  const { data: crossingBlocksData, isLoading } = useQuery({
    queryKey: ['crossing-blocks-dashboard'],
    queryFn: () => crossingBlocks.list(),
  })

  const blockList: CrossingBlock[] = crossingBlocksData?.results ?? []

  return (
    <section className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scissors size={16} className="text-brand-400" />
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Active Crossing Blocks
          </h2>
        </div>
        <button
          className="btn btn-ghost btn-sm text-xs"
          onClick={() => navigate('/crosses')}
        >
          Crossing Block →
        </button>
      </div>

      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading crosses…</div>
      ) : blockList.length === 0 ? (
        <p className="text-muted text-sm">No crossing blocks registered yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
          {blockList.slice(0, 4).map(block => (
            <div
              key={block.id}
              className="card hover-row cursor-pointer"
              style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 4 }}
              onClick={() => navigate('/crosses')}
            >
              <div className="font-semibold text-sm">{block.name}</div>
              <div className="text-xs text-muted flex items-center justify-between">
                <span>{block.season_name || block.program_name || 'Active Season'}</span>
                <span className="badge badge-blue text-xs">{block.cross_count ?? 0} crosses</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

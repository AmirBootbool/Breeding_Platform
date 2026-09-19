import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { crossingBlocks } from '../../api/client'
import { useLowStockAlerts } from '../common/useLowStockAlerts'
import { useNeedsAttentionTrials } from '../common/useNeedsAttentionTrials'

export default function PendingObservationsWidget() {
  const navigate = useNavigate()
  const { data: lowStockLots } = useLowStockAlerts()
  const { data: staleTrials } = useNeedsAttentionTrials()

  const { data: crossingBlocksData } = useQuery({
    queryKey: ['crossing-blocks-dashboard'],
    queryFn: () => crossingBlocks.list(),
  })

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

    if (staleTrials && staleTrials.length > 0) {
      tasks.push({
        icon: '📋',
        title: `${staleTrials.length} Trial(s) With No Observations Yet`,
        desc: `${staleTrials[0].trial_code} was planted over 21 days ago with no scoring recorded.`,
        actionText: 'Review Trial',
        path: '/trials',
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
        path: '/crosses',
        severity: 'info',
      })
    }

    return tasks
  }, [lowStockLots, crossingBlocksData, staleTrials])

  if (pendingTasks.length === 0) {
    return (
      <div className="card mb-6" style={{ padding: 'var(--space-4)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-success)' }}>
          <span>✓</span>
          <span className="font-semibold">All operational tasks up to date</span>
        </div>
      </div>
    )
  }

  return (
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
  )
}

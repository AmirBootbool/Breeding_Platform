import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { crossingBlocks, CrossEntry } from '../api/client'
import { CheckSquare, Filter, Printer, RefreshCw, Calendar, AlertTriangle } from 'lucide-react'
import { useNeedsRetestAlerts } from '../components/common/useNeedsRetestAlerts'
import { useNavigate } from 'react-router-dom'

export default function TodaysTasks() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: retestLots } = useNeedsRetestAlerts()
  const [selectedBlockId, setSelectedBlockId] = useState<number | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedCrossIds, setSelectedCrossIds] = useState<Set<number>>(new Set())
  const [bulkStatusTarget, setBulkStatusTarget] = useState<string>('pollinated')
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Fetch all crossing blocks
  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ['crossing-blocks'],
    queryFn: () => crossingBlocks.list(),
  })

  const blockList = blocksData?.results ?? []

  // Fetch details for blocks to get all crosses
  const { data: blockDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['crossing-blocks-details', blockList.map(b => b.id).join(',')],
    queryFn: async () => {
      const details = await Promise.all(
        blockList.map(b => crossingBlocks.detail(b.id))
      )
      return details
    },
    enabled: blockList.length > 0,
  })

  // Combine all crosses across blocks
  const allCrosses = useMemo(() => {
    if (!blockDetails) return []
    const list: (CrossEntry & { block_id: number; block_name: string; location_name: string | null })[] = []
    blockDetails.forEach(b => {
      (b.crosses ?? []).forEach(c => {
        list.push({
          ...c,
          block_id: b.id,
          block_name: b.name,
          location_name: b.location_name,
        })
      })
    })
    return list
  }, [blockDetails])

  // Filtered crosses
  const filteredCrosses = useMemo(() => {
    return allCrosses.filter(c => {
      if (selectedBlockId !== 'all' && c.block_id !== selectedBlockId) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchCode = c.cross_code.toLowerCase().includes(q)
        const matchFemale = c.female_parent_name.toLowerCase().includes(q)
        const matchMale = c.male_parent_name.toLowerCase().includes(q)
        const matchBlock = c.block_name.toLowerCase().includes(q)
        if (!matchCode && !matchFemale && !matchMale && !matchBlock) return false
      }
      return true
    })
  }, [allCrosses, selectedBlockId, statusFilter, searchQuery])

  // Counts
  const stats = useMemo(() => {
    const total = allCrosses.length
    const planned = allCrosses.filter(c => c.status === 'planned').length
    const pollinated = allCrosses.filter(c => c.status === 'pollinated').length
    const harvested = allCrosses.filter(c => c.status === 'harvested').length
    const failed = allCrosses.filter(c => c.status === 'failed').length
    return { total, planned, pollinated, harvested, failed }
  }, [allCrosses])

  // Bulk update mutation
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ blockId, crossIds, status }: { blockId: number; crossIds: number[]; status: string }) => {
      return crossingBlocks.bulkUpdateStatus(blockId, { cross_ids: crossIds, status })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crossing-blocks-details'] })
      queryClient.invalidateQueries({ queryKey: ['crossing-blocks'] })
      setSelectedCrossIds(new Set())
      setActionMessage('Status updated successfully!')
      setTimeout(() => setActionMessage(null), 3000)
    },
    onError: (err: Error) => {
      setActionMessage(`Error updating status: ${err.message}`)
    },
  })

  const handleApplyBulkStatus = async () => {
    if (selectedCrossIds.size === 0) return
    const idsToUpdate = Array.from(selectedCrossIds)
    // Group by blockId
    const crossesMap = new Map<number, number[]>()
    allCrosses.forEach(c => {
      if (idsToUpdate.includes(c.id)) {
        const existing = crossesMap.get(c.block_id) ?? []
        crossesMap.set(c.block_id, [...existing, c.id])
      }
    })

    for (const [blockId, ids] of crossesMap.entries()) {
      await bulkStatusMutation.mutateAsync({ blockId, crossIds: ids, status: bulkStatusTarget })
    }
  }

  const handleQuickStatus = async (blockId: number, crossId: number, status: string) => {
    await bulkStatusMutation.mutateAsync({ blockId, crossIds: [crossId], status })
  }

  const toggleSelectAll = () => {
    if (selectedCrossIds.size === filteredCrosses.length) {
      setSelectedCrossIds(new Set())
    } else {
      setSelectedCrossIds(new Set(filteredCrosses.map(c => c.id)))
    }
  }

  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedCrossIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedCrossIds(next)
  }

  const handlePrint = () => {
    window.print()
  }

  const isLoading = blocksLoading || detailsLoading

  return (
    <div className="page-container todays-tasks-page" style={{ padding: 'var(--space-4)', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="text-brand-400" size={26} />
            Daily Cross-Nursery Task Agenda
          </h1>
          <p className="text-sm text-muted">
            Field-ready action agenda for crossing technicians, emasculation scheduling, and pollination tracking.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary flex items-center gap-2"
            onClick={handlePrint}
            title="Print technician field agenda"
          >
            <Printer size={16} /> Print Agenda
          </button>
          <button
            type="button"
            className="btn btn-ghost flex items-center gap-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['crossing-blocks-details'] })}
            title="Refresh tasks"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div className="card" style={{ padding: 'var(--space-3)', borderLeft: '4px solid var(--brand-400)' }}>
          <div className="text-xs text-muted">Total Crosses</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-3)', borderLeft: '4px solid var(--amber-400)' }}>
          <div className="text-xs text-muted">Planned (Needs Pollination)</div>
          <div className="text-2xl font-bold text-amber-400">{stats.planned}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-3)', borderLeft: '4px solid #38bdf8' }}>
          <div className="text-xs text-muted">Pollinated (Developing)</div>
          <div className="text-2xl font-bold" style={{ color: '#38bdf8' }}>{stats.pollinated}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-3)', borderLeft: '4px solid #4ade80' }}>
          <div className="text-xs text-muted">Harvested (Seed Ready)</div>
          <div className="text-2xl font-bold" style={{ color: '#4ade80' }}>{stats.harvested}</div>
        </div>
      </div>

      {/* Viability Retest Banner */}
      {retestLots && retestLots.length > 0 && (
        <div className="alert alert-warning mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} />
            <span>
              <strong>{retestLots.length} Seed Lot(s) Need Viability Retest:</strong> Germination testing overdue (&gt; 12 months).
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/seed-inventory')}
          >
            Review Vault Lots →
          </button>
        </div>
      )}

      {/* Action banner */}
      {actionMessage && (
        <div className="alert alert-info mb-4">
          <span>ℹ</span><span>{actionMessage}</span>
        </div>
      )}

      {/* Filter and Bulk Actions Bar */}
      <div className="card mb-4" style={{ padding: 'var(--space-3)' }}>
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={16} className="text-muted" />
            <select
              className="form-input"
              style={{ width: 180, padding: '4px 8px', fontSize: '0.85rem' }}
              value={selectedBlockId}
              onChange={e => setSelectedBlockId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All Crossing Blocks</option>
              {blockList.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <select
              className="form-input"
              style={{ width: 150, padding: '4px 8px', fontSize: '0.85rem' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="planned">Planned</option>
              <option value="pollinated">Pollinated</option>
              <option value="harvested">Harvested</option>
              <option value="failed">Failed</option>
            </select>

            <input
              type="search"
              placeholder="Search cross or parents…"
              className="form-input"
              style={{ width: 220, padding: '4px 8px', fontSize: '0.85rem' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {selectedCrossIds.size > 0 && (
            <div className="flex items-center gap-2 p-1 bg-brand-900/20 rounded border border-brand-500/30">
              <span className="text-xs font-semibold">{selectedCrossIds.size} selected:</span>
              <select
                className="form-input"
                style={{ width: 130, padding: '2px 6px', fontSize: '0.8rem' }}
                value={bulkStatusTarget}
                onChange={e => setBulkStatusTarget(e.target.value)}
              >
                <option value="pollinated">Pollinated</option>
                <option value="harvested">Harvested</option>
                <option value="failed">Failed</option>
                <option value="planned">Planned</option>
              </select>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleApplyBulkStatus}
                disabled={bulkStatusMutation.isPending}
              >
                Apply Status
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Crosses Table */}
      <div className="card">
        {isLoading ? (
          <div className="loading-spinner p-8 text-center"><div className="spinner" /> Loading nursery tasks…</div>
        ) : filteredCrosses.length === 0 ? (
          <div className="empty-state p-8 text-center">
            <CheckSquare size={36} className="text-muted mx-auto mb-2" />
            <p className="text-muted">No cross tasks found matching filters.</p>
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={selectedCrossIds.size === filteredCrosses.length && filteredCrosses.length > 0}
                      onChange={toggleSelectAll}
                      style={{ accentColor: 'var(--brand-400)' }}
                    />
                  </th>
                  <th>Cross Code</th>
                  <th>Block / Location</th>
                  <th>♀ Female Parent</th>
                  <th>♂ Male Parent</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="text-right">Technician Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCrosses.map(c => {
                  const isSelected = selectedCrossIds.has(c.id)
                  return (
                    <tr key={c.id} style={{ background: isSelected ? 'rgba(74, 222, 128, 0.05)' : undefined }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(c.id)}
                          style={{ accentColor: 'var(--brand-400)' }}
                        />
                      </td>
                      <td className="font-mono font-bold text-sm" style={{ color: 'var(--brand-300)' }}>
                        {c.cross_code}
                      </td>
                      <td>
                        <div className="font-medium text-xs">{c.block_name}</div>
                        {c.location_name && <div className="text-xs text-muted">{c.location_name}</div>}
                      </td>
                      <td><strong>{c.female_parent_name}</strong></td>
                      <td><strong>{c.male_parent_name}</strong></td>
                      <td>
                        <span className={`badge ${
                          c.status === 'harvested' ? 'badge-green' :
                          c.status === 'pollinated' ? 'badge-blue' :
                          c.status === 'failed' ? 'badge-red' : 'badge-amber'
                        }`}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-xs text-muted font-mono">{c.cross_date}</td>
                      <td className="text-right">
                        <div className="flex gap-1 justify-end">
                          {c.status === 'planned' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleQuickStatus(c.block_id, c.id, 'pollinated')}
                              title="Mark Pollinated"
                            >
                              ✓ Pollinate
                            </button>
                          )}
                          {c.status === 'pollinated' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => handleQuickStatus(c.block_id, c.id, 'harvested')}
                              title="Mark Harvested"
                            >
                              🌾 Harvest
                            </button>
                          )}
                          {c.status !== 'failed' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost text-red-400"
                              onClick={() => handleQuickStatus(c.block_id, c.id, 'failed')}
                              title="Mark Failed"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

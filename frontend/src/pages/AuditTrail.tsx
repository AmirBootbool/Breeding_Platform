import { useState, useEffect } from 'react'
import { audit, AuditLogEntry, AuditFilterParams } from '../api/client'
import EntityHistoryModal from '../components/audit/EntityHistoryModal'

export default function AuditTrail() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [modelFilter, setModelFilter] = useState<string>('')
  const [userFilter, setUserFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [limit, setLimit] = useState<number>(50)

  // Modal inspection
  const [selectedEntity, setSelectedEntity] = useState<{ model: string; id: number; name: string } | null>(null)

  const fetchAuditData = () => {
    setLoading(true)
    setError(null)
    const params: AuditFilterParams = {
      model: modelFilter || undefined,
      user: userFilter || undefined,
      search: searchQuery || undefined,
      limit,
    }

    audit.getRecentChanges(params)
      .then(res => {
        setEntries(res)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to fetch audit log. Ensure you have administrator or authorized role.')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchAuditData()
  }, [modelFilter, userFilter, limit])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchAuditData()
  }

  // Model badge colors
  const getModelBadgeClass = (model: string) => {
    switch (model.toLowerCase()) {
      case 'trial':
        return 'badge-primary'
      case 'germplasm':
        return 'badge-success'
      case 'seedlot':
      case 'seedtransaction':
        return 'badge-warning'
      case 'program':
        return 'badge-secondary'
      case 'observationvariable':
        return 'badge-outline'
      default:
        return 'badge-outline'
    }
  }

  // Calculate quick metrics
  const uniqueUsers = Array.from(new Set(entries.map(e => e.updated_by || e.created_by).filter(Boolean)))
  const modelCounts = entries.reduce((acc, e) => {
    acc[e.model] = (acc[e.model] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}>
            <span>🛡️ Platform Audit Trail & History</span>
          </h1>
          <p className="text-secondary" style={{ marginTop: 'var(--space-1)', margin: 0 }}>
            Trace system-wide modifications, seed transactions, trial updates, and accession entries across breeding teams.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchAuditData}>
          🔄 Refresh Log
        </button>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="text-xs text-secondary font-semibold" style={{ textTransform: 'uppercase' }}>Recent Changes Logged</div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginTop: 'var(--space-1)', color: 'var(--color-primary)' }}>
            {entries.length}
          </div>
          <div className="text-xs text-secondary" style={{ marginTop: 'var(--space-1)' }}>Capped at {limit} records</div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="text-xs text-secondary font-semibold" style={{ textTransform: 'uppercase' }}>Active Contributors</div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginTop: 'var(--space-1)', color: '#10b981' }}>
            {uniqueUsers.length}
          </div>
          <div className="text-xs text-secondary" style={{ marginTop: 'var(--space-1)' }}>Breeders & technicians</div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="text-xs text-secondary font-semibold" style={{ textTransform: 'uppercase' }}>Active Domains</div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, marginTop: 'var(--space-1)', color: '#f59e0b' }}>
            {Object.keys(modelCounts).length}
          </div>
          <div className="text-xs text-secondary" style={{ marginTop: 'var(--space-1)' }}>Entity models monitored</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        className="card"
        style={{
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          alignItems: 'center',
        }}
      >
        {/* Model Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <label className="text-sm font-semibold">Entity Type:</label>
          <select
            className="form-select text-sm"
            value={modelFilter}
            onChange={e => setModelFilter(e.target.value)}
            style={{ padding: 'var(--space-2)' }}
          >
            <option value="">All Entities</option>
            <option value="germplasm">Germplasm Accessions</option>
            <option value="trial">Trials & Experiments</option>
            <option value="seedlot">Seed Lots</option>
            <option value="seedtransaction">Seed Transactions</option>
            <option value="observationvariable">Traits / Variables</option>
            <option value="program">Breeding Programs</option>
            <option value="location">Locations & Stations</option>
            <option value="season">Seasons</option>
          </select>
        </div>

        {/* User Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <label className="text-sm font-semibold">User:</label>
          <input
            type="text"
            className="form-input text-sm"
            placeholder="Username..."
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            style={{ width: '130px', padding: 'var(--space-2)' }}
          />
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            className="form-input text-sm"
            placeholder="Search by label, name, lot or code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: 'var(--space-2)' }}
          />
          <button type="submit" className="btn btn-secondary btn-sm">Search</button>
        </form>

        {/* Limit Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <label className="text-sm font-semibold">Limit:</label>
          <select
            className="form-select text-sm"
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            style={{ padding: 'var(--space-2)' }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {/* Main Audit Feed Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <div className="spinner" /> <span style={{ marginLeft: 'var(--space-2)' }}>Loading audit stream...</span>
          </div>
        )}

        {error && (
          <div style={{ padding: 'var(--space-6)' }}>
            <div className="alert alert-danger">{error}</div>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No audit records matching criteria.
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: '140px' }}>Timestamp</th>
                <th style={{ width: '130px' }}>Entity</th>
                <th>Description / Target</th>
                <th style={{ width: '100px' }}>Action</th>
                <th style={{ width: '140px' }}>User</th>
                <th style={{ width: '100px', textAlign: 'right' }}>History</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={`${entry.model}-${entry.id}-${idx}`}>
                  <td className="text-xs text-secondary font-mono">
                    {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'N/A'}
                  </td>
                  <td>
                    <span className={`badge ${getModelBadgeClass(entry.model)}`} style={{ fontSize: '11px' }}>
                      {entry.model}
                    </span>
                  </td>
                  <td>
                    <strong style={{ fontSize: 'var(--text-sm)' }}>{entry.label}</strong>
                    <div className="text-xs text-secondary">ID: #{entry.id}</div>
                  </td>
                  <td>
                    <span className={`badge ${entry.action === 'created' ? 'badge-success' : 'badge-outline'}`} style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                      {entry.action || 'Updated'}
                    </span>
                  </td>
                  <td className="text-sm">
                    <strong>{entry.updated_by || entry.created_by || 'system'}</strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                      onClick={() => setSelectedEntity({ model: entry.model, id: entry.id, name: entry.label })}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Inspect Entity Modal */}
      {selectedEntity && (
        <EntityHistoryModal
          model={selectedEntity.model}
          entityId={selectedEntity.id}
          entityName={selectedEntity.name}
          isOpen={true}
          onClose={() => setSelectedEntity(null)}
        />
      )}
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useLowStockAlerts } from '../common/useLowStockAlerts'

export default function LowStockWidget() {
  const navigate = useNavigate()
  const { data: lowStockLots, isLoading } = useLowStockAlerts()

  const list = (lowStockLots || []).slice(0, 5)

  return (
    <section className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400" />
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Seed Vault Low Stock Alert (&lt; 50g)
          </h2>
        </div>
        <button
          className="btn btn-ghost btn-sm text-xs"
          onClick={() => navigate('/seed-inventory')}
        >
          Manage Vault →
        </button>
      </div>

      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading stock alerts…</div>
      ) : list.length === 0 ? (
        <p className="text-muted text-sm">All seed lots currently meet healthy stock thresholds.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map(lot => (
            <div
              key={lot.id}
              className="flex items-center justify-between p-2 rounded hover:bg-hover cursor-pointer"
              onClick={() => navigate('/seed-inventory')}
              style={{ border: '1px solid var(--border-subtle)', fontSize: '0.82rem' }}
            >
              <div>
                <strong className="font-mono text-xs">{lot.lot_code}</strong>
                <span className="text-muted text-xs ml-2">({lot.germplasm_name})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-amber font-semibold text-xs">{lot.quantity_grams} g</span>
                <span className="text-muted text-xs">{lot.storage_location || 'Storage'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

import { useNavigate } from 'react-router-dom'

export default function QuickActionsWidget() {
  const navigate = useNavigate()

  return (
    <section className="mb-6">
      <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        ⚡ Quick Operations
      </h2>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {[
          { label: '+ New Trial', path: '/trials', color: 'var(--brand-500)' },
          { label: '+ Add Germplasm', path: '/germplasm', color: 'hsl(210,70%,60%)' },
          { label: '✂️ Crossing Block', path: '/crosses', color: 'hsl(45,90%,55%)' },
          { label: '📦 Seed Inventory & Barcodes', path: '/seed-inventory', color: 'hsl(280,55%,60%)' },
          { label: '🏷️ Trait & Variable Library', path: '/traits', color: 'hsl(180,60%,50%)' },
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
  )
}

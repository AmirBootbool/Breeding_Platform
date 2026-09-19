import { useQuery } from '@tanstack/react-query'
import { germplasm, Germplasm } from '../api/client'

export default function GermplasmHistoryPanel({ entry }: { entry: Germplasm }) {
  const { data, isLoading } = useQuery({
    queryKey: ['germplasm-history', entry.id],
    queryFn: () => germplasm.getHistory(entry.id),
  })

  if (isLoading || !data) return null

  return (
    <div className="card" style={{ marginTop: 'var(--space-3)' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        History
        {data.is_shortlisted && <span className="badge badge-blue">★ Shortlisted ({data.shortlist_source})</span>}
      </div>

      <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Trials ({data.trial_history.length})</p>
      {data.trial_history.length === 0 ? (
        <p className="text-sm text-muted">Not yet placed in a trial.</p>
      ) : (
        <ul className="text-sm" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {data.trial_history.map((t, i) => (
            <li key={i}>{t.trial_code} — {t.season_name ?? '—'} @ {t.location_name ?? '—'} (plot {t.plot_number}, {t.status})</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted" style={{ marginTop: 'var(--space-3)' }}>Crosses ({data.cross_history.length})</p>
      {data.cross_history.length === 0 ? (
        <p className="text-sm text-muted">Not part of any recorded cross.</p>
      ) : (
        <ul className="text-sm" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {data.cross_history.map((c, i) => (
            <li key={i}>{c.cross_code} (as {c.role}, with {c.other_parent}) — {c.status}{c.progeny_name ? ` → ${c.progeny_name}` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { trials, Trial } from '../../api/client'

export default function QcReviewTab({ trial }: { trial: Trial }) {
  const { data, isLoading } = useQuery({
    queryKey: ['qc-flags', trial.id],
    queryFn: () => trials.getQcFlags(trial.id),
  })

  if (isLoading) return <div className="loading-spinner"><div className="spinner" /> Checking for outliers…</div>
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✓</div>
        <p>No statistical outliers found (values within 3 standard deviations of each trait's mean).</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-muted mb-3">
        {data.length} observation(s) are more than 3 standard deviations from their trait's mean in this trial. This is a statistical flag, not proof of an error — review before trusting them in analysis.
      </p>
      <table className="data-table">
        <thead>
          <tr><th>Plot</th><th>Trait</th><th>Value</th><th>Trial Mean</th><th>Trial Std Dev</th><th>Z-score</th></tr>
        </thead>
        <tbody>
          {data.map((f, i) => (
            <tr key={i}>
              <td>{f.plot_number}</td><td>{f.variable_name}</td>
              <td className="font-bold">{f.value}</td>
              <td className="text-muted">{f.trial_mean}</td>
              <td className="text-muted">{f.trial_stdev}</td>
              <td><span className="badge badge-amber">{f.z_score}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

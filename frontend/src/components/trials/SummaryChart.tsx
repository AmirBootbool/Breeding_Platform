import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar
} from 'recharts'
import { TrialSummaryRow } from '../../api/client'

const CHART_COLOR = 'hsl(142, 52%, 44%)'

interface SummaryChartProps {
  rows: TrialSummaryRow[]
}

export default function SummaryChart({ rows }: SummaryChartProps) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <p>No numeric observations recorded yet.</p>
      </div>
    )
  }

  const chartData = rows.map(r => ({
    name: r.variable,
    mean: r.mean ?? 0,
    error: r.std_dev ?? 0,
    unit: r.unit,
    count: r.count,
  }))

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Mean ± Std Dev per Trait</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 12
            }}
            formatter={(value: number, name: string, props: { payload?: { unit?: string } }) => {
              if (name === 'mean') return [`${value.toFixed(3)} ${props.payload?.unit ?? ''}`, 'Mean']
              return [value, name]
            }}
          />
          <Bar dataKey="mean" fill={CHART_COLOR} radius={[4, 4, 0, 0]}>
            <ErrorBar dataKey="error" width={4} strokeWidth={2} stroke="var(--amber-400)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="table-container mt-6">
        <table className="data-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Unit</th>
              <th>N</th>
              <th>Mean</th>
              <th>Min</th>
              <th>Max</th>
              <th>SD</th>
              <th>CV%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.variable}>
                <td><strong>{r.variable}</strong></td>
                <td className="text-muted text-sm">{r.unit || '—'}</td>
                <td>{r.count}</td>
                <td className="font-mono">{r.mean?.toFixed(3) ?? '—'}</td>
                <td className="font-mono">{r.min ?? '—'}</td>
                <td className="font-mono">{r.max ?? '—'}</td>
                <td className="font-mono">{r.std_dev?.toFixed(3) ?? '—'}</td>
                <td className="font-mono">{r.cv_percent?.toFixed(1) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

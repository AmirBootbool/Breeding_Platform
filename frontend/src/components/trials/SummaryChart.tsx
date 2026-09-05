import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar,
  ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts'
import { TrialSummaryRow } from '../../api/client'

const CHART_COLOR = 'hsl(142, 52%, 44%)'
const COLORS = ['hsl(142,52%,44%)','hsl(210,70%,60%)','hsl(45,90%,55%)','hsl(0,70%,60%)','hsl(280,55%,60%)']

interface SummaryChartProps {
  rows: TrialSummaryRow[]
}

type ChartType = 'bar' | 'scatter'

export default function SummaryChart({ rows }: SummaryChartProps) {
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [selectedRow, setSelectedRow] = useState<string>(rows[0]?.variable ?? '')
  const [xVar, setXVar] = useState<string>(rows[0]?.variable ?? '')
  const [yVar, setYVar] = useState<string>(rows[1]?.variable ?? rows[0]?.variable ?? '')

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <p>No numeric observations recorded yet.</p>
      </div>
    )
  }

  const numericRows = rows.filter(r => r.mean != null)
  const chartData = numericRows.map((r, i) => ({
    name: r.variable,
    mean: r.mean ?? 0,
    error: r.std_dev ?? 0,
    unit: r.unit,
    count: r.count,
    min: r.min ?? 0,
    max: r.max ?? 0,
    cv: r.cv_percent ?? 0,
    color: COLORS[i % COLORS.length],
  }))

  const focused = numericRows.find(r => r.variable === selectedRow)

  function exportSVG() {
    const svg = document.querySelector('.recharts-wrapper svg')
    if (!svg) return
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'chart.svg'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="card-title" style={{ margin: 0 }}>Summary Statistics</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Trait selector for bar chart */}
          {chartType === 'bar' && numericRows.length > 1 && (
            <select className="form-input" style={{ width: 180, fontSize: '0.82rem' }}
              value={selectedRow} onChange={e => setSelectedRow(e.target.value)}>
              <option value="">All traits</option>
              {numericRows.map(r => <option key={r.variable} value={r.variable}>{r.variable}</option>)}
            </select>
          )}
          {/* Chart type toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 2 }}>
            <button className={`btn btn-sm ${chartType === 'bar' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setChartType('bar')}>📊 Bar</button>
            <button className={`btn btn-sm ${chartType === 'scatter' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setChartType('scatter')}>◎ Scatter</button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={exportSVG} title="Export chart as SVG">↓ SVG</button>
        </div>
      </div>

      {/* Scatter axis selectors */}
      {chartType === 'scatter' && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="form-group mb-0" style={{ flex: '0 0 180px' }}>
            <label className="form-label">X Axis</label>
            <select className="form-input" value={xVar} onChange={e => setXVar(e.target.value)}>
              {numericRows.map(r => <option key={r.variable} value={r.variable}>{r.variable}</option>)}
            </select>
          </div>
          <div className="form-group mb-0" style={{ flex: '0 0 180px' }}>
            <label className="form-label">Y Axis</label>
            <select className="form-input" value={yVar} onChange={e => setYVar(e.target.value)}>
              {numericRows.map(r => <option key={r.variable} value={r.variable}>{r.variable}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Bar chart */}
      {chartType === 'bar' && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={selectedRow && selectedRow !== '' ? chartData.filter(d => d.name === selectedRow) : chartData}
            margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }}
              formatter={(value: number, name: string, props: { payload?: { unit?: string; cv?: number; min?: number; max?: number } }) => {
                if (name === 'mean') return [
                  `${value.toFixed(3)} ${props.payload?.unit ?? ''} (CV: ${props.payload?.cv?.toFixed(1)}%, Range: ${props.payload?.min}–${props.payload?.max})`,
                  'Mean',
                ]
                return [value, name]
              }}
            >
            </Tooltip>
            <Bar dataKey="mean" radius={[4, 4, 0, 0]}>
              {(selectedRow ? chartData.filter(d => d.name === selectedRow) : chartData).map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
              <ErrorBar dataKey="error" width={4} strokeWidth={2} stroke="var(--amber-400)" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Scatter chart — plots mean × mean of two traits */}
      {chartType === 'scatter' && (() => {
        const xRow = numericRows.find(r => r.variable === xVar)
        const yRow = numericRows.find(r => r.variable === yVar)
        if (!xRow || !yRow) return <div className="empty-state"><p>Select two traits to compare.</p></div>
        const scatterData = [{ x: xRow.mean, y: yRow.mean, z: xRow.count, name: 'Trial Mean' }]
        return (
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="x" name={xVar} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: xVar, position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis dataKey="y" name={yVar} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: yVar, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }} />
              <ZAxis dataKey="z" range={[60, 400]} />
              <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
              <Scatter data={scatterData} fill={CHART_COLOR} />
            </ScatterChart>
          </ResponsiveContainer>
        )
      })()}

      {/* Focused row detail */}
      {focused && chartType === 'bar' && selectedRow && (
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 8, background: 'var(--surface-2)' }}>
          {[
            ['N', focused.count],
            ['Mean', focused.mean?.toFixed(3)],
            ['Min', focused.min],
            ['Max', focused.max],
            ['SD', focused.std_dev?.toFixed(3)],
            ['CV%', focused.cv_percent?.toFixed(1)],
          ].map(([k, v]) => (
            <div key={k as string} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--brand-300)' }}>{v ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Summary table */}
      <div className="table-container mt-6">
        <table className="data-table">
          <thead>
            <tr>
              <th>Variable</th><th>Unit</th><th>N</th><th>Mean</th><th>Min</th><th>Max</th><th>SD</th><th>CV%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.variable}
                style={{ cursor: 'pointer', background: selectedRow === r.variable ? 'var(--brand-900)' : undefined }}
                onClick={() => { setSelectedRow(r.variable); setChartType('bar') }}>
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

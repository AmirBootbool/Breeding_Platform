import { useMemo } from 'react'
import { Plot } from '../../api/client'

interface GermplasmListTabProps {
  plotList: Plot[]
  expectedReps?: number
}

export default function GermplasmListTab({ plotList, expectedReps }: GermplasmListTabProps) {
  const germplasmMap = useMemo(() => {
    const map = new Map<number, { name: string; reps: number; isCheck: boolean; plots: number[] }>()
    plotList.forEach(p => {
      if (!map.has(p.germplasm)) {
        map.set(p.germplasm, { name: p.germplasm_name, reps: 0, isCheck: p.is_check, plots: [] })
      }
      const entry = map.get(p.germplasm)!
      entry.reps += 1
      entry.plots.push(p.plot_number)
    })
    return map
  }, [plotList])

  const germplasmArray = Array.from(germplasmMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const checkLines = germplasmArray.filter(g => g.isCheck)
  const testLines  = germplasmArray.filter(g => !g.isCheck)

  const missingReps = expectedReps
    ? germplasmArray.filter(g => !g.isCheck && g.reps < expectedReps)
    : []

  function exportCSV() {
    const rows = [
      ['Germplasm ID', 'Name', 'Type', 'Reps', 'Plot Numbers'],
      ...germplasmArray.map(g => [
        g.id,
        g.name,
        g.isCheck ? 'Check' : 'Test',
        g.reps,
        g.plots.sort((a, b) => a - b).join('; '),
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'germplasm_list.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (germplasmArray.length === 0) {
    return <div className="empty-state"><p>No germplasm available in this trial.</p></div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div className="card-title" style={{ margin: 0 }}>
          Trial Germplasm — {testLines.length} test, {checkLines.length} check ({germplasmArray.length} total)
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
          <span className="badge badge-amber">★ {checkLines.length} Check</span>
          <span className="badge badge-blue">⚡ {testLines.length} Test</span>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} title="Export germplasm list as CSV">
            ↓ CSV
          </button>
        </div>
      </div>

      {missingReps.length > 0 && (
        <div className="alert alert-error mb-4">
          <span>⚠</span>
          <span>
            {missingReps.length} test line{missingReps.length > 1 ? 's' : ''} have fewer than {expectedReps} rep{(expectedReps ?? 0) > 1 ? 's' : ''}:
            {' '}{missingReps.slice(0, 5).map(g => g.name).join(', ')}{missingReps.length > 5 ? '…' : ''}
          </span>
        </div>
      )}

      <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Germplasm Name</th>
              <th>System ID</th>
              <th>Reps (Plots)</th>
              <th>Plot Numbers</th>
            </tr>
          </thead>
          <tbody>
            {germplasmArray.map(g => (
              <tr key={g.id} style={g.isCheck ? { background: 'var(--brand-900)' } : {}}>
                <td>
                  {g.isCheck
                    ? <span className="badge badge-amber">★ Check</span>
                    : <span className="badge badge-blue">⚡ Test</span>
                  }
                </td>
                <td><strong>{g.name}</strong></td>
                <td><code className="font-mono text-xs">{g.id}</code></td>
                <td>
                  <span style={{
                    color: (expectedReps && !g.isCheck && g.reps < expectedReps) ? 'var(--status-danger)' : 'inherit',
                    fontWeight: (expectedReps && !g.isCheck && g.reps < expectedReps) ? 700 : 400,
                  }}>
                    {g.reps}
                  </span>
                </td>
                <td className="text-xs text-muted">{g.plots.sort((a, b) => a - b).slice(0, 8).join(', ')}{g.plots.length > 8 ? '…' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

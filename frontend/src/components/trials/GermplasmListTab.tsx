import { Plot } from '../../api/client'

interface GermplasmListTabProps {
  plotList: Plot[]
}

export default function GermplasmListTab({ plotList }: GermplasmListTabProps) {
  // Extract unique germplasm
  const germplasmMap = new Map<number, { name: string; reps: number }>()

  plotList.forEach(p => {
    if (!germplasmMap.has(p.germplasm)) {
      germplasmMap.set(p.germplasm, { name: p.germplasm_name, reps: 0 })
    }
    germplasmMap.get(p.germplasm)!.reps += 1
  })

  const germplasmArray = Array.from(germplasmMap.entries()).map(([id, data]) => ({ id, ...data }))

  if (germplasmArray.length === 0) {
    return (
      <div className="empty-state">
        <p>No germplasm available in this trial.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="card-title mb-4">Trial Germplasm ({germplasmArray.length} unique lines)</div>
      <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Germplasm Name</th>
              <th>System ID</th>
              <th>Total Plots (Reps)</th>
            </tr>
          </thead>
          <tbody>
            {germplasmArray.map(g => (
              <tr key={g.id}>
                <td><strong>{g.name}</strong></td>
                <td><code className="font-mono">{g.id}</code></td>
                <td>{g.reps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

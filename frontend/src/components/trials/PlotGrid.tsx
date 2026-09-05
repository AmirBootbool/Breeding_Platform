import { useState } from 'react'
import { Plot } from '../../api/client'
import { colorForIndex, StatusBadge } from './types'
import SpatialHeatmapModal from './SpatialHeatmapModal'

interface PlotGridProps {
  plotList: Plot[]
  selectedPlots?: number[]
  onSelectPlot?: (id: number) => void
  trialId?: number
  trialCode?: string
}

export default function PlotGrid({ plotList, selectedPlots, onSelectPlot, trialId, trialCode }: PlotGridProps) {
  const [showHeatmap, setShowHeatmap] = useState(false)
  const actualTrialId = trialId || plotList[0]?.trial
  const actualTrialCode = trialCode || `Trial #${actualTrialId || ''}`

  const germplasmIds = [...new Set(plotList.map(p => p.germplasm))]
  const colorMap: Record<number, number> = {}
  germplasmIds.forEach((id, idx) => { colorMap[id] = idx })

  const reps = [...new Set(plotList.map(p => p.rep))].sort((a, b) => a - b)
  const isAlpha = plotList.some(p => p.incomplete_block !== null && p.incomplete_block !== undefined)
  const isLatinSquare = plotList.some(p => p.row !== null && p.row !== undefined && p.column !== null && p.column !== undefined)

  if (isLatinSquare) {
    const rows = [...new Set(plotList.map(p => p.row as number))].sort((a, b) => a - b)
    const cols = [...new Set(plotList.map(p => p.column as number))].sort((a, b) => a - b)
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div className="card-title">
            Plot Layout — {plotList.length} plots (Latin Square)
          </div>
          {actualTrialId && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowHeatmap(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}
            >
              <span>🌿 Spatial Heatmap</span>
            </button>
          )}
        </div>
        {actualTrialId && (
          <SpatialHeatmapModal
            trialId={actualTrialId}
            trialCode={actualTrialCode}
            isOpen={showHeatmap}
            onClose={() => setShowHeatmap(false)}
          />
        )}
        <div className="plot-grid" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)`, gap: 'var(--space-2)' }}>
          {rows.map(r => 
            cols.map(c => {
              const plot = plotList.find(p => p.row === r && p.column === c)
              if (!plot) return <div key={`${r}-${c}`} className="plot-card" style={{ opacity: 0 }} />
              const colorIdx = colorMap[plot.germplasm] ?? 0
              const [bg, border] = colorForIndex(colorIdx)
              return (
                <div
                  key={plot.id}
                  className={`plot-card ${selectedPlots?.includes(plot.id) ? 'selected-row' : ''}`}
                  style={{ backgroundColor: bg, borderColor: border, cursor: onSelectPlot ? 'pointer' : 'default' }}
                  onClick={() => onSelectPlot?.(plot.id)}
                >
                  {onSelectPlot && (
                    <input type="checkbox" checked={selectedPlots?.includes(plot.id)} readOnly style={{ position: 'absolute', top: 4, left: 4 }} />
                  )}
                  <div className="plot-number">{plot.plot_number}</div>
                  <div className="plot-germplasm">{plot.germplasm_name}</div>
                  <div className="text-xs" style={{ opacity: 0.7 }}>R:{r} C:{c}</div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div className="card-title">
          Plot Layout — {plotList.length} plots
        </div>
        {actualTrialId && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowHeatmap(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}
          >
            <span>🌿 Spatial Heatmap</span>
          </button>
        )}
      </div>
      {actualTrialId && (
        <SpatialHeatmapModal
          trialId={actualTrialId}
          trialCode={actualTrialCode}
          isOpen={showHeatmap}
          onClose={() => setShowHeatmap(false)}
        />
      )}
      {reps.map(repNum => {
        const repPlots = plotList.filter(p => p.rep === repNum).sort((a, b) => a.plot_number - b.plot_number)
        const blocks = isAlpha 
          ? [...new Set(repPlots.map(p => p.incomplete_block))].sort((a, b) => (a || 0) - (b || 0))
          : [null]

        return (
          <div key={repNum} className="mb-6" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)' }}>
            <div className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-300)' }}>
              Replication {repNum}
            </div>

            {blocks.map((blockNum, bIdx) => {
              const blockPlots = isAlpha 
                ? repPlots.filter(p => p.incomplete_block === blockNum)
                : repPlots
              const cols = Math.min(Math.ceil(Math.sqrt(blockPlots.length)), 10)

              return (
                <div key={bIdx} className="mb-4">
                  {isAlpha && blockNum !== null && (
                    <div className="text-xs text-muted mb-2 font-mono" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Incomplete Block {blockNum}
                    </div>
                  )}
                  <div className="plot-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'var(--space-2)' }}>
                    {blockPlots.map(plot => {
                      const [bg, fg] = colorForIndex(colorMap[plot.germplasm])
                      const isCheckPlot = plot.is_check
                      return (
                        <div
                          key={plot.id}
                          className={`plot-cell ${isCheckPlot ? 'check-plot' : ''} ${selectedPlots?.includes(plot.id) ? 'selected-row' : ''}`}
                          style={{
                            background: isCheckPlot ? 'var(--bg-card)' : bg,
                            color: isCheckPlot ? 'var(--text-primary)' : fg,
                            border: isCheckPlot ? '2px dashed var(--amber-500)' : '1px solid var(--border-default)',
                            borderRadius: '4px',
                            padding: 'var(--space-2)',
                            cursor: onSelectPlot ? 'pointer' : 'default',
                            minHeight: '60px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                          onClick={() => onSelectPlot?.(plot.id)}
                          title={`Plot ${plot.plot_number} | Rep ${plot.rep} | ${plot.germplasm_name}${plot.incomplete_block ? ` | Block ${plot.incomplete_block}` : ''}${isCheckPlot ? ' (Check)' : ''}`}
                        >
                          {onSelectPlot && (
                            <input type="checkbox" checked={selectedPlots?.includes(plot.id)} readOnly style={{ position: 'absolute', top: 4, left: 4 }} />
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="plot-num font-mono text-xs" style={{ opacity: 0.8 }}>#{plot.plot_number}</span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <StatusBadge status={plot.status} />
                              {isCheckPlot && (
                                <span style={{ fontSize: '9px', background: 'var(--amber-500)', color: '#000', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>CHECK</span>
                              )}
                            </div>
                          </div>
                          <span className="plot-germ font-semibold text-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plot.germplasm_name}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
      <div className="flex gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
        {germplasmIds.map((id, idx) => {
          const name = plotList.find(p => p.germplasm === id)?.germplasm_name ?? String(id)
          const [bg, fg] = colorForIndex(idx)
          return (
            <div key={id} className="flex items-center gap-2" style={{ fontSize: '0.75rem' }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${fg}` }} />
              <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Plot } from '../../api/client'
import { colorForIndex, StatusBadge } from './types'
import SpatialHeatmapModal from './SpatialHeatmapModal'
import Modal from '../Modal'

interface PlotGridProps {
  plotList: Plot[]
  selectedPlots?: number[]
  onSelectPlot?: (id: number) => void
  trialId?: number
  trialCode?: string
}

type ColorByOption = 'germplasm' | 'rep' | 'check' | 'block' | 'status'

export default function PlotGrid({ plotList, selectedPlots, onSelectPlot, trialId, trialCode }: PlotGridProps) {
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [colorBy, setColorBy] = useState<ColorByOption>('germplasm')
  const [inspectPlot, setInspectPlot] = useState<Plot | null>(null)
  const [isPrintMode, setIsPrintMode] = useState(false)

  const actualTrialId = trialId || plotList[0]?.trial
  const actualTrialCode = trialCode || `Trial #${actualTrialId || ''}`

  const germplasmIds = [...new Set(plotList.map(p => p.germplasm))]
  const germColorMap: Record<number, number> = {}
  germplasmIds.forEach((id, idx) => { germColorMap[id] = idx })

  const reps = [...new Set(plotList.map(p => p.rep))].sort((a, b) => a - b)
  const isAlpha = plotList.some(p => p.incomplete_block !== null && p.incomplete_block !== undefined)
  const isLatinSquare = plotList.some(p => p.row !== null && p.row !== undefined && p.column !== null && p.column !== undefined)

  function getPlotStyle(plot: Plot) {
    if (colorBy === 'check') {
      if (plot.is_check) {
        return {
          background: 'rgba(245, 158, 11, 0.2)',
          color: '#fbbf24',
          border: '2px dashed #f59e0b',
        }
      }
      return {
        background: 'rgba(34, 197, 94, 0.15)',
        color: '#4ade80',
        border: '1px solid rgba(34, 197, 94, 0.3)',
      }
    }
    if (colorBy === 'rep') {
      const [bg, fg] = colorForIndex((plot.rep - 1) % 12)
      return { background: bg, color: fg, border: `1px solid ${fg}55` }
    }
    if (colorBy === 'block') {
      const b = (plot.incomplete_block || 1) % 12
      const [bg, fg] = colorForIndex(b)
      return { background: bg, color: fg, border: `1px solid ${fg}55` }
    }
    if (colorBy === 'status') {
      const statusColors: Record<string, [string, string, string]> = {
        active: ['rgba(34, 197, 94, 0.15)', '#4ade80', 'rgba(34, 197, 94, 0.4)'],
        harvested: ['rgba(59, 130, 246, 0.15)', '#60a5fa', 'rgba(59, 130, 246, 0.4)'],
        discarded: ['rgba(239, 68, 68, 0.15)', '#f87171', 'rgba(239, 68, 68, 0.4)'],
        selected: ['rgba(245, 158, 11, 0.2)', '#fbbf24', '#f59e0b'],
      }
      const [bg, col, brd] = statusColors[plot.status] || ['var(--bg-card)', 'var(--text-primary)', 'var(--border-default)']
      return { background: bg, color: col, border: `1px solid ${brd}` }
    }
    // Default: by germplasm
    if (plot.is_check) {
      return {
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        border: '2px dashed var(--amber-500)',
      }
    }
    const [bg, fg] = colorForIndex(germColorMap[plot.germplasm] ?? 0)
    return { background: bg, color: fg, border: '1px solid var(--border-default)' }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className={`plot-grid-container ${isPrintMode ? 'print-preview-mode' : ''}`}>
      {/* Header controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div className="card-title">
          Plot Layout — {plotList.length} plots {isLatinSquare ? '(Latin Square)' : ''}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Color by:</span>
            <select
              className="form-input"
              style={{ width: 140, padding: '4px 8px', fontSize: '0.8rem' }}
              value={colorBy}
              onChange={e => setColorBy(e.target.value as ColorByOption)}
            >
              <option value="germplasm">Germplasm</option>
              <option value="check">Check vs Test</option>
              <option value="rep">Replication</option>
              {isAlpha && <option value="block">Incomplete Block</option>}
              <option value="status">Plot Status</option>
            </select>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsPrintMode(prev => !prev)}
            title="Toggle print layout"
          >
            🖨️ {isPrintMode ? 'Exit Print View' : 'Print Mode'}
          </button>

          {isPrintMode && (
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              Print Layout
            </button>
          )}

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
      </div>

      {actualTrialId && (
        <SpatialHeatmapModal
          trialId={actualTrialId}
          trialCode={actualTrialCode}
          isOpen={showHeatmap}
          onClose={() => setShowHeatmap(false)}
        />
      )}

      {/* Latin Square View */}
      {isLatinSquare ? (
        (() => {
          const rows = [...new Set(plotList.map(p => p.row as number))].sort((a, b) => a - b)
          const cols = [...new Set(plotList.map(p => p.column as number))].sort((a, b) => a - b)
          return (
            <div className="plot-grid" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)`, gap: 'var(--space-2)' }}>
              {rows.map(r => 
                cols.map(c => {
                  const plot = plotList.find(p => p.row === r && p.column === c)
                  if (!plot) return <div key={`${r}-${c}`} className="plot-card" style={{ opacity: 0 }} />
                  const style = getPlotStyle(plot)
                  return (
                    <div
                      key={plot.id}
                      className={`plot-card ${selectedPlots?.includes(plot.id) ? 'selected-row' : ''}`}
                      style={{
                        ...style,
                        cursor: 'pointer',
                        padding: 'var(--space-2)',
                        minHeight: '65px',
                        borderRadius: 'var(--radius-sm)',
                        position: 'relative'
                      }}
                      onClick={() => {
                        if (onSelectPlot) onSelectPlot(plot.id)
                        else setInspectPlot(plot)
                      }}
                      onDoubleClick={() => setInspectPlot(plot)}
                    >
                      {onSelectPlot && (
                        <input
                          type="checkbox"
                          checked={selectedPlots?.includes(plot.id)}
                          readOnly
                          style={{ position: 'absolute', top: 4, left: 4 }}
                        />
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="plot-number font-mono text-xs">#{plot.plot_number}</span>
                        {plot.is_check && <span style={{ fontSize: '9px', background: 'var(--amber-500)', color: '#000', padding: '0 3px', borderRadius: '2px', fontWeight: 700 }}>CHECK</span>}
                      </div>
                      <div className="plot-germplasm font-semibold text-xs" style={{ marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {plot.germplasm_name}
                      </div>
                      <div className="text-xs font-mono" style={{ opacity: 0.7, marginTop: 2 }}>R:{r} C:{c}</div>
                    </div>
                  )
                })
              )}
            </div>
          )
        })()
      ) : (
        /* Standard Replications / Incomplete Blocks Layout */
        reps.map(repNum => {
          const repPlots = plotList.filter(p => p.rep === repNum).sort((a, b) => a.plot_number - b.plot_number)
          const blocks = isAlpha 
            ? [...new Set(repPlots.map(p => p.incomplete_block))].sort((a, b) => (a || 0) - (b || 0))
            : [null]

          return (
            <div key={repNum} className="mb-6" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)' }}>
              <div className="text-sm font-semibold mb-3" style={{ color: 'var(--brand-300)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span>Replication {repNum}</span>
                <span className="badge badge-gray">{repPlots.length} plots</span>
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
                        Incomplete Block {blockNum} ({blockPlots.length} plots)
                      </div>
                    )}
                    <div className="plot-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'var(--space-2)' }}>
                      {blockPlots.map(plot => {
                        const style = getPlotStyle(plot)
                        return (
                          <div
                            key={plot.id}
                            className={`plot-cell ${plot.is_check ? 'check-plot' : ''} ${selectedPlots?.includes(plot.id) ? 'selected-row' : ''}`}
                            style={{
                              ...style,
                              borderRadius: '4px',
                              padding: 'var(--space-2)',
                              cursor: 'pointer',
                              minHeight: '62px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              position: 'relative'
                            }}
                            onClick={() => {
                              if (onSelectPlot) onSelectPlot(plot.id)
                              else setInspectPlot(plot)
                            }}
                            onDoubleClick={() => setInspectPlot(plot)}
                            title={`Plot ${plot.plot_number} | Rep ${plot.rep} | ${plot.germplasm_name} (Click to inspect)`}
                          >
                            {onSelectPlot && (
                              <input
                                type="checkbox"
                                checked={selectedPlots?.includes(plot.id)}
                                readOnly
                                style={{ position: 'absolute', top: 4, left: 4 }}
                              />
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="plot-num font-mono text-xs" style={{ opacity: 0.85, fontWeight: 700 }}>
                                #{plot.plot_number}
                              </span>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <StatusBadge status={plot.status} />
                                {plot.is_check && (
                                  <span style={{ fontSize: '9px', background: 'var(--amber-500)', color: '#000', padding: '0 4px', borderRadius: '3px', fontWeight: 700 }}>CHECK</span>
                                )}
                              </div>
                            </div>
                            <span className="plot-germ font-semibold text-xs" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {plot.germplasm_name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })
      )}

      {/* Legend */}
      {colorBy === 'germplasm' && (
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
      )}

      {/* Plot Inspection Modal */}
      {inspectPlot && (
        <Modal title={`Plot #${inspectPlot.plot_number} Details`} onClose={() => setInspectPlot(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Germplasm Entry</label>
                <div className="font-semibold text-sm">{inspectPlot.germplasm_name}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Type / Role</label>
                <div>
                  {inspectPlot.is_check ? (
                    <span className="badge badge-amber">Reference Check Line</span>
                  ) : (
                    <span className="badge badge-green">Candidate Entry</span>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Replication</label>
                <div className="font-mono text-sm">Rep {inspectPlot.rep}</div>
              </div>
              {inspectPlot.incomplete_block && (
                <div className="form-group">
                  <label className="form-label">Incomplete Block</label>
                  <div className="font-mono text-sm">Block {inspectPlot.incomplete_block}</div>
                </div>
              )}
              {inspectPlot.row !== null && inspectPlot.column !== null && (
                <div className="form-group">
                  <label className="form-label">Grid Coordinates</label>
                  <div className="font-mono text-sm">Row {inspectPlot.row}, Col {inspectPlot.column}</div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Status</label>
                <div><StatusBadge status={inspectPlot.status} /></div>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary" onClick={() => setInspectPlot(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

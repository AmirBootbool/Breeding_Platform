import { useState, useEffect } from 'react'
import { trials, traits, ObservationVariable, SpatialHeatmapData, SpatialPlotCell } from '../../api/client'

interface SpatialHeatmapModalProps {
  trialId: number
  trialCode: string
  isOpen: boolean
  onClose: () => void
}

type PaletteType = 'viridis' | 'plasma' | 'green_red' | 'sunlight'

export default function SpatialHeatmapModal({
  trialId,
  trialCode,
  isOpen,
  onClose,
}: SpatialHeatmapModalProps) {
  const [variables, setVariables] = useState<ObservationVariable[]>([])
  const [selectedVarId, setSelectedVarId] = useState<number | null>(null)
  const [heatmapData, setHeatmapData] = useState<SpatialHeatmapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<SpatialPlotCell | null>(null)
  const [palette, setPalette] = useState<PaletteType>('viridis')
  const [showCheckOnly, setShowCheckOnly] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    traits.list().then(res => {
      const vars = res.results.filter(v => v.data_type === 'numeric')
      setVariables(vars)
      if (vars.length > 0 && !selectedVarId) {
        setSelectedVarId(vars[0].id)
      }
    }).catch(err => console.error('Failed to load traits', err))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !selectedVarId) return
    setLoading(true)
    setError(null)
    trials.getSpatialHeatmap(trialId, selectedVarId)
      .then(data => {
        setHeatmapData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to generate spatial heatmap.')
        setLoading(false)
      })
  }, [isOpen, trialId, selectedVarId])

  if (!isOpen) return null

  // Color interpolation helpers
  const getColor = (normalized: number | null, isCheck: boolean): string => {
    if (normalized === null) return 'rgba(100, 116, 139, 0.2)' // missing data
    if (showCheckOnly && !isCheck) return 'rgba(100, 116, 139, 0.15)'

    const t = Math.max(0, Math.min(1, normalized))

    if (palette === 'green_red') {
      // Red (0) -> Yellow (0.5) -> Green (1)
      const r = t < 0.5 ? 239 : Math.round(239 - (t - 0.5) * 2 * (239 - 34))
      const g = t < 0.5 ? Math.round(68 + t * 2 * (197 - 68)) : 197
      const b = t < 0.5 ? 68 : Math.round(68 - (t - 0.5) * 2 * (68 - 94))
      return `rgb(${r}, ${g}, ${b})`
    } else if (palette === 'plasma') {
      // Purple (0) -> Orange -> Yellow (1)
      const r = Math.round(13 + t * 227)
      const g = Math.round(8 + t * (t < 0.5 ? 80 : 210))
      const b = Math.round(135 - t * 100)
      return `rgb(${r}, ${g}, ${b})`
    } else if (palette === 'sunlight') {
      // High contrast Amber to Emerald
      const r = Math.round(217 - t * 180)
      const g = Math.round(119 + t * 60)
      const b = Math.round(6 + t * 120)
      return `rgb(${r}, ${g}, ${b})`
    } else {
      // Viridis default: Deep Purple (0) -> Teal (0.5) -> Yellow (1)
      const r = Math.round(68 + t * 170)
      const g = Math.round(1 + t * 210)
      const b = Math.round(84 + (1 - t) * 70 - t * 50)
      return `rgb(${r}, ${g}, ${b})`
    }
  }

  const distinctRows = heatmapData
    ? Array.from(new Set(heatmapData.cells.map(c => c.row))).sort((a, b) => a - b)
    : []
  const distinctCols = heatmapData
    ? Array.from(new Set(heatmapData.cells.map(c => c.column))).sort((a, b) => a - b)
    : []

  const cellMap = new Map<string, SpatialPlotCell>()
  if (heatmapData) {
    heatmapData.cells.forEach(c => cellMap.set(`${c.row}_${c.column}`, c))
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        className="modal-content"
        style={{
          width: '95vw',
          maxWidth: '1200px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--space-6)',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>🌿 Spatial Field Heatmap</span>
              <span className="badge badge-primary">{trialCode}</span>
            </h2>
            <p className="text-sm text-secondary" style={{ marginTop: 'var(--space-1)', margin: 0 }}>
              Visualize 2D plot-level observation gradients, microclimate variance, and spatial row/col soil trends.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* Controls Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
          }}
        >
          {/* Trait Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label className="text-sm font-semibold">Observation Trait:</label>
            <select
              className="form-select text-sm"
              value={selectedVarId ?? ''}
              onChange={e => setSelectedVarId(Number(e.target.value))}
              style={{ minWidth: '180px', padding: 'var(--space-1) var(--space-2)' }}
            >
              {variables.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.unit || 'unit'})
                </option>
              ))}
            </select>
          </div>

          {/* Color Palette */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label className="text-sm font-semibold">Palette:</label>
            <select
              className="form-select text-sm"
              value={palette}
              onChange={e => setPalette(e.target.value as PaletteType)}
              style={{ padding: 'var(--space-1) var(--space-2)' }}
            >
              <option value="viridis">Viridis (Standard)</option>
              <option value="plasma">Plasma (Thermal)</option>
              <option value="green_red">Green / Red (Agronomic)</option>
              <option value="sunlight">Sunlight Field Mode</option>
            </select>
          </div>

          {/* Checks Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
            <input
              type="checkbox"
              checked={showCheckOnly}
              onChange={e => setShowCheckOnly(e.target.checked)}
            />
            <span>Highlight Checks Only</span>
          </label>

          {/* Stats Badges */}
          {heatmapData?.stats && (
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto', fontSize: 'var(--text-xs)' }}>
              <span className="badge badge-outline">Min: {heatmapData.stats.min ?? 'N/A'} {heatmapData.variable.unit}</span>
              <span className="badge badge-outline">Mean: {heatmapData.stats.mean ?? 'N/A'} {heatmapData.variable.unit}</span>
              <span className="badge badge-outline">Max: {heatmapData.stats.max ?? 'N/A'} {heatmapData.variable.unit}</span>
              <span className="badge badge-primary">{heatmapData.stats.count} plots scored</span>
            </div>
          )}
        </div>

        {/* Main Visualization Grid */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            position: 'relative',
            minHeight: '340px',
          }}
        >
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <div className="spinner" /> <span style={{ marginLeft: 'var(--space-2)' }}>Generating spatial gradient matrix...</span>
            </div>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          {!loading && !error && heatmapData && distinctRows.length > 0 && (
            <div style={{ overflowX: 'auto', padding: 'var(--space-2)' }}>
              {/* Column Margin Means Header */}
              <div style={{ display: 'flex', marginLeft: '60px', marginBottom: 'var(--space-2)', gap: '4px' }}>
                {distinctCols.map(c => {
                  const colStat = heatmapData.col_margins.find(m => m.column === c)
                  return (
                    <div
                      key={`col-${c}`}
                      style={{
                        width: '72px',
                        minWidth: '72px',
                        textAlign: 'center',
                        fontSize: '10px',
                        color: 'var(--color-text-secondary)',
                        padding: '2px',
                        backgroundColor: 'var(--color-surface-hover)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      title={`Column ${c} Average: ${colStat?.mean ?? 'N/A'}`}
                    >
                      <div style={{ fontWeight: 600 }}>C{c}</div>
                      <div>{colStat?.mean !== null && colStat?.mean !== undefined ? `${colStat.mean}` : '-'}</div>
                    </div>
                  )
                })}
              </div>

              {/* Rows */}
              {distinctRows.map(r => {
                const rowStat = heatmapData.row_margins.find(m => m.row === r)
                return (
                  <div key={`row-${r}`} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', gap: '4px' }}>
                    {/* Row Label & Mean Margin */}
                    <div
                      style={{
                        width: '56px',
                        minWidth: '56px',
                        fontSize: '10px',
                        textAlign: 'right',
                        paddingRight: 'var(--space-2)',
                        color: 'var(--color-text-secondary)',
                      }}
                      title={`Row ${r} Average: ${rowStat?.mean ?? 'N/A'}`}
                    >
                      <div style={{ fontWeight: 600 }}>R{r}</div>
                      <div>{rowStat?.mean !== null && rowStat?.mean !== undefined ? `${rowStat.mean}` : '-'}</div>
                    </div>

                    {/* Cells in Row */}
                    {distinctCols.map(c => {
                      const cell = cellMap.get(`${r}_${c}`)
                      if (!cell) {
                        return (
                          <div
                            key={`empty-${r}-${c}`}
                            style={{
                              width: '72px',
                              minWidth: '72px',
                              height: '54px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'transparent',
                            }}
                          />
                        )
                      }

                      const bg = getColor(cell.normalized_value, cell.is_check)
                      const isHovered = hoveredCell?.plot_id === cell.plot_id

                      return (
                        <div
                          key={cell.plot_id}
                          onMouseEnter={() => setHoveredCell(cell)}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            width: '72px',
                            minWidth: '72px',
                            height: '54px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: bg,
                            border: isHovered
                              ? '2px solid white'
                              : cell.is_check
                              ? '2px dashed #f59e0b'
                              : '1px solid rgba(0,0,0,0.15)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                            zIndex: isHovered ? 10 : 1,
                            boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
                            padding: '2px',
                            color: '#fff',
                            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                          }}
                        >
                          <div style={{ fontSize: '10px', fontWeight: 700 }}>#{cell.plot_number}</div>
                          <div style={{ fontSize: '11px', fontWeight: 800 }}>
                            {cell.raw_value !== null ? `${cell.raw_value}` : '—'}
                          </div>
                          <div
                            style={{
                              fontSize: '8px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '68px',
                              opacity: 0.9,
                            }}
                          >
                            {cell.germplasm_name}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Hovered Cell Detail Drawer */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--text-sm)',
          }}
        >
          {hoveredCell ? (
            <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
              <div>
                <span className="text-secondary">Plot: </span>
                <strong>#{hoveredCell.plot_number}</strong> (Row {hoveredCell.row}, Col {hoveredCell.column})
              </div>
              <div>
                <span className="text-secondary">Germplasm: </span>
                <strong>{hoveredCell.germplasm_name}</strong>
                {hoveredCell.is_check && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Check</span>}
              </div>
              <div>
                <span className="text-secondary">Rep / Block: </span>
                <strong>Rep {hoveredCell.rep}</strong> {hoveredCell.block ? `(Block ${hoveredCell.block})` : ''}
              </div>
              <div>
                <span className="text-secondary">Observed {heatmapData?.variable.name}: </span>
                <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-primary)' }}>
                  {hoveredCell.raw_value !== null ? `${hoveredCell.raw_value} ${heatmapData?.variable.unit}` : 'Not Scored'}
                </strong>
              </div>
            </div>
          ) : (
            <span className="text-secondary">💡 Hover over any field plot to inspect lineage, check assignment, and exact score.</span>
          )}

          {/* Color scale legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
            <span>Low ({heatmapData?.stats.min ?? 0})</span>
            <div
              style={{
                width: '90px',
                height: '10px',
                borderRadius: '4px',
                background:
                  palette === 'green_red'
                    ? 'linear-gradient(to right, rgb(239,68,68), rgb(239,197,68), rgb(34,197,94))'
                    : palette === 'plasma'
                    ? 'linear-gradient(to right, rgb(13,8,135), rgb(200,80,100), rgb(240,220,35))'
                    : 'linear-gradient(to right, rgb(68,1,84), rgb(33,144,141), rgb(253,231,37))',
              }}
            />
            <span>High ({heatmapData?.stats.max ?? 100})</span>
          </div>
        </div>
      </div>
    </div>
  )
}

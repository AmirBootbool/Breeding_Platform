import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { germplasm, PedigreeNode } from '../../api/client'

interface PedigreeTreeModalProps {
  germplasmId: number
  germplasmName: string
  onClose: () => void
  onSelectGermplasm?: (id: number) => void
}

interface FlattenedNode {
  node: PedigreeNode
  x: number
  y: number
  tier: number
  role: 'root' | 'female' | 'male' | 'child'
  parentId?: string
  id: string
}

interface Connection {
  fromX: number
  fromY: number
  toX: number
  toY: number
  role: 'root' | 'female' | 'male' | 'child'
}

export default function PedigreeTreeModal({
  germplasmId,
  germplasmName,
  onClose,
  onSelectGermplasm,
}: PedigreeTreeModalProps) {
  const [activeRootId, setActiveRootId] = useState(germplasmId)
  const [depth, setDepth] = useState(3)
  const [direction, setDirection] = useState<'ancestors' | 'progeny'>('ancestors')
  const [selectedNode, setSelectedNode] = useState<PedigreeNode | null>(null)

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 60, y: 180 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const containerRef = useRef<HTMLDivElement>(null)

  const { data: treeData, isLoading, error } = useQuery({
    queryKey: ['pedigree-tree', activeRootId, depth, direction],
    queryFn: () => germplasm.getPedigreeTree(activeRootId, depth, direction),
  })

  useEffect(() => {
    if (treeData) {
      setSelectedNode(treeData)
    }
  }, [treeData])

  // Compute Layout positions
  const { nodes, connections, totalHeight } = useMemo(() => {
    if (!treeData) return { nodes: [], connections: [], totalHeight: 600 }

    const flatNodes: FlattenedNode[] = []
    const flatConnections: Connection[] = []
    const NODE_WIDTH = 200
    const NODE_HEIGHT = 86
    const TIER_GAP = 120

    if (direction === 'ancestors') {
      const getLeafCount = (node: PedigreeNode | null, currentDepth: number): number => {
        if (!node || currentDepth >= depth) return 1
        const fCount = node.parent_female ? getLeafCount(node.parent_female, currentDepth + 1) : 1
        const mCount = node.parent_male ? getLeafCount(node.parent_male, currentDepth + 1) : 1
        return Math.max(1, fCount + mCount)
      }

      const totalLeaves = Math.max(4, getLeafCount(treeData, 1))
      const ROW_HEIGHT = 110
      const totalH = Math.max(500, totalLeaves * ROW_HEIGHT)

      const layoutAncestors = (
        node: PedigreeNode,
        tier: number,
        yMin: number,
        yMax: number,
        role: 'root' | 'female' | 'male',
        pathId: string,
        parentPos?: { x: number; y: number }
      ) => {
        const x = tier * (NODE_WIDTH + TIER_GAP) + 50
        const y = (yMin + yMax) / 2

        const nodeId = `${pathId}-${node.id}`
        flatNodes.push({
          node,
          x,
          y: y - NODE_HEIGHT / 2,
          tier,
          role,
          id: nodeId,
        })

        if (parentPos) {
          flatConnections.push({
            fromX: parentPos.x + NODE_WIDTH,
            fromY: parentPos.y + NODE_HEIGHT / 2,
            toX: x,
            toY: y,
            role,
          })
        }

        if (tier < depth) {
          const midY = (yMin + yMax) / 2
          if (node.parent_female) {
            layoutAncestors(
              node.parent_female,
              tier + 1,
              yMin,
              midY,
              'female',
              `${nodeId}-f`,
              { x, y: y - NODE_HEIGHT / 2 }
            )
          }
          if (node.parent_male) {
            layoutAncestors(
              node.parent_male,
              tier + 1,
              midY,
              yMax,
              'male',
              `${nodeId}-m`,
              { x, y: y - NODE_HEIGHT / 2 }
            )
          }
        }
      }

      layoutAncestors(treeData, 0, 20, totalH, 'root', 'root')

      return {
        nodes: flatNodes,
        connections: flatConnections,
        totalHeight: totalH + 100,
      }
    } else {
      const layoutProgeny = (
        node: PedigreeNode,
        tier: number,
        yStart: number,
        parentPos?: { x: number; y: number }
      ): number => {
        const x = tier * (NODE_WIDTH + TIER_GAP) + 50
        const children = node.progeny || []
        
        let currentY = yStart
        const childPositions: { x: number; y: number }[] = []

        if (children.length === 0) {
          const y = currentY
          flatNodes.push({
            node,
            x,
            y,
            tier,
            role: tier === 0 ? 'root' : 'child',
            id: `prog-${tier}-${node.id}-${yStart}`,
          })
          if (parentPos) {
            flatConnections.push({
              fromX: parentPos.x + NODE_WIDTH,
              fromY: parentPos.y + NODE_HEIGHT / 2,
              toX: x,
              toY: y + NODE_HEIGHT / 2,
              role: 'child',
            })
          }
          return currentY + NODE_HEIGHT + 30
        }

        for (const child of children) {
          const nextY = layoutProgeny(child, tier + 1, currentY, { x, y: currentY })
          childPositions.push({ x: (tier + 1) * (NODE_WIDTH + TIER_GAP) + 50, y: (currentY + nextY - 30) / 2 })
          currentY = nextY
        }

        const avgY = (childPositions[0].y + childPositions[childPositions.length - 1].y) / 2
        flatNodes.push({
          node,
          x,
          y: avgY,
          tier,
          role: tier === 0 ? 'root' : 'child',
          id: `prog-${tier}-${node.id}`,
        })

        if (parentPos) {
          flatConnections.push({
            fromX: parentPos.x + NODE_WIDTH,
            fromY: parentPos.y + NODE_HEIGHT / 2,
            toX: x,
            toY: avgY + NODE_HEIGHT / 2,
            role: 'child',
          })
        }

        return currentY
      }

      const totalH = layoutProgeny(treeData, 0, 40)

      return {
        nodes: flatNodes,
        connections: flatConnections,
        totalHeight: Math.max(600, totalH + 100),
      }
    }
  }, [treeData, depth, direction])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    setZoom(prev => Math.min(Math.max(0.4, prev * zoomFactor), 2.2))
  }

  return (
    <div 
      className="modal-backdrop" 
      style={{ 
        position: 'fixed', 
        inset: 0, 
        backgroundColor: 'rgba(0, 0, 0, 0.75)', 
        zIndex: 1000, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: 'var(--space-4)'
      }}
    >
      <div 
        className="modal-window slide-in" 
        style={{ 
          width: '95vw', 
          maxWidth: 1400, 
          height: '90vh', 
          display: 'flex', 
          flexDirection: 'column',
          backgroundColor: 'var(--surface-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header toolbar */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: 'var(--space-3) var(--space-5)', 
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--surface-hover)'
          }}
        >
          <div className="flex items-center gap-3">
            <div 
              style={{ 
                padding: '6px 10px', 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--brand-400)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem'
              }}
            >
              🌳
            </div>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span>{treeData?.name || germplasmName}</span>
                {treeData && (
                  <span className="badge badge-green" style={{ fontSize: '0.75rem' }}>
                    {treeData.generation_label}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted font-mono">
                Pedigree Tree Visualizer & Lineage Tracing
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Direction Selector */}
            <div className="flex items-center bg-surface-base rounded-md p-1 border border-color">
              <button
                className={`btn btn-sm ${direction === 'ancestors' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => setDirection('ancestors')}
              >
                Ancestors (Pedigree)
              </button>
              <button
                className={`btn btn-sm ${direction === 'progeny' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => setDirection('progeny')}
              >
                Progeny (Descendants)
              </button>
            </div>

            {/* Depth Selector */}
            <div className="flex items-center gap-1.5 text-xs text-muted" style={{ padding: '0 var(--space-2)' }}>
              <span>Depth:</span>
              <select 
                className="form-input" 
                style={{ width: 75, padding: '2px 6px', fontSize: '0.8rem' }}
                value={depth}
                onChange={e => setDepth(Number(e.target.value))}
              >
                <option value={1}>1 Tier</option>
                <option value={2}>2 Tiers</option>
                <option value={3}>3 Tiers</option>
                <option value={4}>4 Tiers</option>
                <option value={5}>5 Tiers</option>
              </select>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <button 
                className="btn btn-ghost btn-sm" 
                title="Zoom Out" 
                onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
              >
                🔍-
              </button>
              <span className="text-xs font-mono" style={{ width: 44, textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button 
                className="btn btn-ghost btn-sm" 
                title="Zoom In" 
                onClick={() => setZoom(z => Math.min(2.2, z + 0.15))}
              >
                🔍+
              </button>
              <button 
                className="btn btn-ghost btn-sm" 
                title="Reset View" 
                onClick={() => { setZoom(1); setPan({ x: 60, y: 180 }) }}
              >
                ↺
              </button>
            </div>

            <div style={{ width: 1, height: 24, backgroundColor: 'var(--border-color)', margin: '0 4px' }} />

            <button 
              className="btn btn-ghost btn-sm" 
              onClick={onClose}
              style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, fontSize: '1.1rem' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tree Canvas Area & Detail Sidebar */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedNode ? '1fr 310px' : '1fr', position: 'relative', overflow: 'hidden' }}>
          
          {/* Interactive SVG Canvas */}
          <div 
            ref={containerRef}
            style={{ 
              width: '100%', 
              height: '100%', 
              overflow: 'hidden', 
              cursor: isDragging ? 'grabbing' : 'grab',
              backgroundColor: 'var(--surface-base)',
              position: 'relative'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {isLoading ? (
              <div className="loading-spinner" style={{ height: '100%' }}>
                <div className="spinner" /> 
                <span>Tracing genealogical pedigree lineage…</span>
              </div>
            ) : error ? (
              <div className="empty-state" style={{ height: '100%' }}>
                <div className="empty-icon">⚠</div>
                <p>Failed to load pedigree tree.</p>
              </div>
            ) : (
              <svg 
                width="100%" 
                height="100%" 
                style={{ overflow: 'visible' }}
              >
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  
                  {/* Grid background markers for tiers */}
                  {Array.from({ length: depth + 1 }).map((_, tierIndex) => (
                    <g key={tierIndex}>
                      <line 
                        x1={tierIndex * 320 + 50} 
                        y1={-500} 
                        x2={tierIndex * 320 + 50} 
                        y2={totalHeight + 500} 
                        stroke="var(--border-color)" 
                        strokeDasharray="4 6" 
                        opacity={0.4} 
                      />
                      <text 
                        x={tierIndex * 320 + 60} 
                        y={-20} 
                        fill="var(--text-muted)" 
                        fontSize="12" 
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        {direction === 'ancestors' 
                          ? (tierIndex === 0 ? 'Focus Line' : tierIndex === 1 ? 'Parents (Tier 1)' : tierIndex === 2 ? 'Grandparents (Tier 2)' : `Ancestors (Tier ${tierIndex})`)
                          : (tierIndex === 0 ? 'Founder Line' : `Progeny (Gen ${tierIndex})`)}
                      </text>
                    </g>
                  ))}

                  {/* Connecting Bézier Curves */}
                  {connections.map((c, i) => {
                    const midX = (c.fromX + c.toX) / 2
                    const pathD = `M ${c.fromX} ${c.fromY} C ${midX} ${c.fromY}, ${midX} ${c.toY}, ${c.toX} ${c.toY}`
                    const strokeColor = c.role === 'female' 
                      ? '#ec4899' 
                      : c.role === 'male' 
                      ? '#3b82f6' 
                      : 'var(--brand-500)'

                    return (
                      <g key={i}>
                        <path 
                          d={pathD} 
                          fill="none" 
                          stroke={strokeColor} 
                          strokeWidth="2.5" 
                          opacity="0.65" 
                        />
                        <circle cx={c.toX} cy={c.toY} r="3.5" fill={strokeColor} />
                      </g>
                    )
                  })}

                  {/* Nodes */}
                  {nodes.map(item => {
                    const isSelected = selectedNode?.id === item.node.id
                    const isRoot = item.role === 'root'
                    const isFemale = item.role === 'female'
                    const isMale = item.role === 'male'

                    const borderAccent = isFemale 
                      ? '#ec4899' 
                      : isMale 
                      ? '#3b82f6' 
                      : isRoot 
                      ? 'var(--brand-400)' 
                      : 'var(--border-color)'

                    return (
                      <g 
                        key={item.id}
                        transform={`translate(${item.x}, ${item.y})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedNode(item.node)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Node Card Box */}
                        <rect 
                          width="200" 
                          height="86" 
                          rx="8" 
                          fill="var(--surface-card)"
                          stroke={isSelected ? 'var(--brand-400)' : borderAccent}
                          strokeWidth={isSelected ? '2.5' : isRoot ? '2' : '1.5'}
                          filter="drop-shadow(0 4px 6px rgba(0,0,0,0.15))"
                        />

                        {/* Top Role Indicator Bar */}
                        <path 
                          d="M 1 8 A 7 7 0 0 1 8 1 L 192 1 A 7 7 0 0 1 199 8 L 199 5 L 1 5 Z" 
                          fill={borderAccent} 
                        />

                        {/* Node Header: Role Badge + Generation */}
                        <text x="12" y="24" fill={borderAccent} fontSize="11" fontWeight="700">
                          {isFemale ? '♀ Female Parent' : isMale ? '♂ Male Parent' : isRoot ? '★ Focus Line' : '🌱 Lineage'}
                        </text>

                        <rect 
                          x="152" 
                          y="12" 
                          width="36" 
                          height="18" 
                          rx="4" 
                          fill="var(--surface-hover)" 
                          stroke="var(--border-color)"
                        />
                        <text 
                          x="170" 
                          y="25" 
                          fill="var(--text-primary)" 
                          fontSize="10" 
                          fontWeight="700" 
                          textAnchor="middle"
                        >
                          {item.node.generation_label}
                        </text>

                        {/* Accession Name */}
                        <text 
                          x="12" 
                          y="46" 
                          fill="var(--text-primary)" 
                          fontSize="13" 
                          fontWeight="700"
                          style={{ textOverflow: 'ellipsis' }}
                        >
                          {item.node.name.length > 20 ? item.node.name.substring(0, 18) + '…' : item.node.name}
                        </text>

                        {/* Subtitle: DB ID & Species */}
                        <text x="12" y="64" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">
                          {item.node.germplasm_db_id}
                        </text>

                        {/* Cross Type or Year */}
                        <text x="12" y="78" fill="var(--text-muted)" fontSize="10">
                          {item.node.cross_type !== 'unknown' ? item.node.cross_type : item.node.species}
                        </text>
                      </g>
                    )
                  })}
                </g>
              </svg>
            )}

            {/* Quick helper tip */}
            <div 
              style={{ 
                position: 'absolute', 
                bottom: 12, 
                left: 12, 
                padding: '4px 10px', 
                backgroundColor: 'var(--surface-card)', 
                borderRadius: 'var(--radius-sm)', 
                border: '1px solid var(--border-color)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>✨ Scroll to zoom · Drag to pan · Click any node to inspect or re-root</span>
            </div>
          </div>

          {/* Right Inspection & Lineage Action Panel */}
          {selectedNode && (
            <div 
              style={{ 
                borderLeft: '1px solid var(--border-color)', 
                backgroundColor: 'var(--surface-card)', 
                padding: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge badge-green">{selectedNode.generation_label}</span>
                <span className="font-mono text-xs text-muted">{selectedNode.germplasm_db_id}</span>
              </div>

              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '4px 0' }}>
                  {selectedNode.name}
                </h3>
                <p className="text-xs text-muted">{selectedNode.species}</p>
              </div>

              <div className="divider" style={{ margin: '4px 0' }} />

              <div className="pedigree-row">
                <span className="pedigree-label">Program</span>
                <span className="text-sm">{selectedNode.program_name || '—'}</span>
              </div>

              <div className="pedigree-row">
                <span className="pedigree-label">Cross Type</span>
                <span className="text-sm font-semibold">{selectedNode.cross_type}</span>
              </div>

              <div className="pedigree-row">
                <span className="pedigree-label">Year</span>
                <span className="text-sm">{selectedNode.year_developed ?? '—'}</span>
              </div>

              {selectedNode.pedigree_string && (
                <div style={{ marginTop: 4 }}>
                  <div className="pedigree-label" style={{ marginBottom: 4 }}>Pedigree Slash String</div>
                  <code 
                    className="font-mono text-xs" 
                    style={{ 
                      display: 'block', 
                      padding: '6px 8px', 
                      backgroundColor: 'var(--surface-base)', 
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--brand-300)',
                      wordBreak: 'break-all'
                    }}
                  >
                    {selectedNode.pedigree_string}
                  </code>
                </div>
              )}

              {/* Parents direct summary */}
              <div style={{ marginTop: 'var(--space-2)' }}>
                <div className="card-title" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Immediate Parents</div>
                <div 
                  style={{ 
                    padding: '8px', 
                    borderRadius: 'var(--radius-md)', 
                    backgroundColor: 'rgba(236, 72, 153, 0.08)',
                    border: '1px solid rgba(236, 72, 153, 0.25)',
                    marginBottom: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#ec4899', fontWeight: 700 }}>♀ Female Parent</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {selectedNode.parent_female?.name ?? 'Unknown / Founder'}
                    </div>
                  </div>
                  {selectedNode.parent_female && (
                    <button 
                      className="btn btn-ghost btn-sm"
                      title="Re-root tree to Female Parent"
                      onClick={() => setActiveRootId(selectedNode.parent_female!.id)}
                    >
                      ➔
                    </button>
                  )}
                </div>

                <div 
                  style={{ 
                    padding: '8px', 
                    borderRadius: 'var(--radius-md)', 
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 700 }}>♂ Male Parent</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {selectedNode.parent_male?.name ?? 'Unknown / Founder'}
                    </div>
                  </div>
                  {selectedNode.parent_male && (
                    <button 
                      className="btn btn-ghost btn-sm"
                      title="Re-root tree to Male Parent"
                      onClick={() => setActiveRootId(selectedNode.parent_male!.id)}
                    >
                      ➔
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {selectedNode.id !== activeRootId && (
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setActiveRootId(selectedNode.id)}
                  >
                    ⇄ Re-center Tree Here
                  </button>
                )}

                {onSelectGermplasm && (
                  <button 
                    className="btn btn-secondary" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      onSelectGermplasm(selectedNode.id)
                      onClose()
                    }}
                  >
                    ↗ Open in Germplasm Table
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

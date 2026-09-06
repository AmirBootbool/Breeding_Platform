import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plot, trials, Germplasm, germplasm as germplasmApi } from '../../api/client'
import { colorForIndex, StatusBadge } from './types'
import SpatialHeatmapModal from './SpatialHeatmapModal'
import Modal from '../Modal'
import { ContextMenu } from '../common/ContextMenu'

interface PlotGridProps {
  plotList: Plot[]
  selectedPlots?: number[]
  onSelectPlot?: (id: number) => void
  trialId?: number
  trialCode?: string
  onRefresh?: () => void
}

type ColorByOption = 'no_fill' | 'accession' | 'check' | 'border' | 'rep' | 'block' | 'status'

interface UndoAction {
  type: 'swap' | 'paste' | 'remove' | 'paint_border' | 'edit'
  description: string
  plotsBefore: Plot[]
  plotsAfter: Plot[]
}

export default function PlotGrid({
  plotList: initialPlotList,
  selectedPlots,
  onSelectPlot,
  trialId,
  trialCode,
  onRefresh
}: PlotGridProps) {
  // Local state of plots to allow in-memory edits before saving
  const [plots, setPlots] = useState<Plot[]>(initialPlotList)
  useEffect(() => {
    setPlots(initialPlotList)
  }, [initialPlotList])

  // Lock / Unlock State
  const [isLocked, setIsLocked] = useState<boolean>(true)
  const [isPaintBorderMode, setIsPaintBorderMode] = useState<boolean>(false)
  const [dirtyPlotIds, setDirtyPlotIds] = useState<Set<number>>(new Set())
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null)

  // Undo / Redo History
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const [redoStack, setRedoStack] = useState<UndoAction[]>([])

  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState<{
    germplasm: number
    germplasm_name: string
    is_check: boolean
    is_border?: boolean
  } | null>(null)

  // Drag & Drop
  const [draggedPlotId, setDraggedPlotId] = useState<number | null>(null)
  const [dragOverPlotId, setDragOverPlotId] = useState<number | null>(null)

  // Modals & Popovers
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [colorBy, setColorBy] = useState<ColorByOption>('no_fill')
  const [inspectPlot, setInspectPlot] = useState<Plot | null>(null)
  const [editPlot, setEditPlot] = useState<Plot | null>(null)
  const [showAddGridModal, setShowAddGridModal] = useState<boolean>(false)
  const [isPrintMode, setIsPrintMode] = useState(false)

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    plot: Plot
  } | null>(null)

  // Add Grid Cells state
  const [gridAddType, setGridAddType] = useState<'row' | 'column'>('row')
  const [gridAddLocation, setGridAddLocation] = useState<'top' | 'bottom' | 'left' | 'right'>('top')
  const [gridAddCount, setGridAddCount] = useState<number>(1)
  const [isAddingGrid, setIsAddingGrid] = useState<boolean>(false)

  // Available germplasm for edit selector
  const [availableGermplasm, setAvailableGermplasm] = useState<Germplasm[]>([])
  useEffect(() => {
    germplasmApi.list('&page_size=300').then(res => {
      setAvailableGermplasm(res.results || [])
    }).catch(() => {})
  }, [])

  const actualTrialId = trialId || plots[0]?.trial
  const actualTrialCode = trialCode || `Trial #${actualTrialId || ''}`

  // Deterministic Accession Color Map
  const germplasmIds = useMemo(() => [...new Set(plots.map(p => p.germplasm))], [plots])
  const germColorMap = useMemo(() => {
    const map: Record<number, number> = {}
    germplasmIds.forEach((id, idx) => {
      map[id] = idx
    })
    return map
  }, [germplasmIds])

  // Toast Helper
  const showToast = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 5000)
  }

  // Push to Undo Stack
  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack(prev => [...prev.slice(-30), action])
    setRedoStack([])
  }, [])

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const lastAction = undoStack[undoStack.length - 1]
    const newUndo = undoStack.slice(0, -1)

    // Revert plots to plotsBefore
    setPlots(prev => {
      const plotMap = new Map(prev.map(p => [p.id, { ...p }]))
      lastAction.plotsBefore.forEach(p => plotMap.set(p.id, { ...p }))
      return Array.from(plotMap.values())
    })

    // Track dirty IDs
    setDirtyPlotIds(prev => {
      const next = new Set(prev)
      lastAction.plotsBefore.forEach(p => next.add(p.id))
      return next
    })

    setUndoStack(newUndo)
    setRedoStack(prev => [...prev, lastAction])
    showToast(`↩️ Undid: ${lastAction.description}`, 'info')
  }, [undoStack])

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const nextAction = redoStack[redoStack.length - 1]
    const newRedo = redoStack.slice(0, -1)

    // Apply plotsAfter
    setPlots(prev => {
      const plotMap = new Map(prev.map(p => [p.id, { ...p }]))
      nextAction.plotsAfter.forEach(p => plotMap.set(p.id, { ...p }))
      return Array.from(plotMap.values())
    })

    setDirtyPlotIds(prev => {
      const next = new Set(prev)
      nextAction.plotsAfter.forEach(p => next.add(p.id))
      return next
    })

    setRedoStack(newRedo)
    setUndoStack(prev => [...prev, nextAction])
    showToast(`↪️ Redid: ${nextAction.description}`, 'info')
  }, [redoStack])

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) handleRedo()
        else handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  // Save All Changes to Backend
  const handleSave = async () => {
    if (!actualTrialId || dirtyPlotIds.size === 0) return
    setIsSaving(true)
    try {
      const modifiedPlots = plots.filter(p => dirtyPlotIds.has(p.id))
      await trials.batchUpdatePlots(actualTrialId, modifiedPlots)
      setDirtyPlotIds(new Set())
      setUndoStack([])
      setRedoStack([])
      showToast(`💾 Successfully saved ${modifiedPlots.length} plot changes to database!`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      showToast(`Failed to save plot changes: ${err.message || err}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Drag and Drop Swap Handler (Intra-rep only)
  const handleDrop = (targetPlot: Plot) => {
    if (isLocked || !draggedPlotId || draggedPlotId === targetPlot.id) {
      setDraggedPlotId(null)
      setDragOverPlotId(null)
      return
    }

    const sourcePlot = plots.find(p => p.id === draggedPlotId)
    if (!sourcePlot) {
      setDraggedPlotId(null)
      setDragOverPlotId(null)
      return
    }

    // Guard: Rep check
    if (sourcePlot.rep !== targetPlot.rep) {
      showToast(
        `⚠️ Invalid Move: Drag-and-drop is restricted within the same replication. Source is Rep ${sourcePlot.rep}, Target is Rep ${targetPlot.rep}.`,
        'error'
      )
      setDraggedPlotId(null)
      setDragOverPlotId(null)
      return
    }

    // Perform Germplasm Swap
    const newSource: Plot = {
      ...sourcePlot,
      germplasm: targetPlot.germplasm,
      germplasm_name: targetPlot.germplasm_name,
      is_check: targetPlot.is_check,
      is_border: targetPlot.is_border,
      status: targetPlot.status,
    }

    const newTarget: Plot = {
      ...targetPlot,
      germplasm: sourcePlot.germplasm,
      germplasm_name: sourcePlot.germplasm_name,
      is_check: sourcePlot.is_check,
      is_border: sourcePlot.is_border,
      status: sourcePlot.status,
    }

    pushUndo({
      type: 'swap',
      description: `Swap Plot #${sourcePlot.plot_number} ↔ Plot #${targetPlot.plot_number}`,
      plotsBefore: [{ ...sourcePlot }, { ...targetPlot }],
      plotsAfter: [{ ...newSource }, { ...newTarget }]
    })

    setPlots(prev => prev.map(p => {
      if (p.id === sourcePlot.id) return newSource
      if (p.id === targetPlot.id) return newTarget
      return p
    }))

    setDirtyPlotIds(prev => new Set(prev).add(sourcePlot.id).add(targetPlot.id))
    showToast(`Swapped entries between Plot #${sourcePlot.plot_number} and Plot #${targetPlot.plot_number}`, 'success')
    setDraggedPlotId(null)
    setDragOverPlotId(null)
  }

  // Paint Border Handler
  const handleTogglePlotBorder = (plot: Plot) => {
    if (isLocked) return
    const updated: Plot = {
      ...plot,
      is_border: !plot.is_border
    }

    pushUndo({
      type: 'paint_border',
      description: `Toggle border on Plot #${plot.plot_number}`,
      plotsBefore: [{ ...plot }],
      plotsAfter: [{ ...updated }]
    })

    setPlots(prev => prev.map(p => p.id === plot.id ? updated : p))
    setDirtyPlotIds(prev => new Set(prev).add(plot.id))
  }

  // Context Menu Actions
  const handleContextMenuAction = (action: string, plot: Plot) => {
    if (action === 'copy') {
      setClipboard({
        germplasm: plot.germplasm,
        germplasm_name: plot.germplasm_name,
        is_check: plot.is_check,
        is_border: plot.is_border
      })
      showToast(`📋 Copied "${plot.germplasm_name}" from Plot #${plot.plot_number}`, 'info')
    } else if (action === 'paste') {
      if (!clipboard) return
      const updated: Plot = {
        ...plot,
        germplasm: clipboard.germplasm,
        germplasm_name: clipboard.germplasm_name,
        is_check: clipboard.is_check,
        is_border: clipboard.is_border
      }

      pushUndo({
        type: 'paste',
        description: `Paste into Plot #${plot.plot_number}`,
        plotsBefore: [{ ...plot }],
        plotsAfter: [{ ...updated }]
      })

      setPlots(prev => prev.map(p => p.id === plot.id ? updated : p))
      setDirtyPlotIds(prev => new Set(prev).add(plot.id))
      showToast(`📌 Pasted "${clipboard.germplasm_name}" into Plot #${plot.plot_number}`, 'success')
    } else if (action === 'remove') {
      const updated: Plot = {
        ...plot,
        germplasm_name: '[Empty Plot]',
        is_check: false,
        is_border: true
      }

      pushUndo({
        type: 'remove',
        description: `Clear Plot #${plot.plot_number}`,
        plotsBefore: [{ ...plot }],
        plotsAfter: [{ ...updated }]
      })

      setPlots(prev => prev.map(p => p.id === plot.id ? updated : p))
      setDirtyPlotIds(prev => new Set(prev).add(plot.id))
      showToast(`Cleared Plot #${plot.plot_number}`, 'info')
    } else if (action === 'toggle_border') {
      handleTogglePlotBorder(plot)
    } else if (action === 'edit') {
      setEditPlot(plot)
    }
  }

  // Quick Plot Edit Submit
  const handleSaveEditPlot = (updated: Plot) => {
    const original = plots.find(p => p.id === updated.id)
    if (!original) return

    pushUndo({
      type: 'edit',
      description: `Edit Plot #${updated.plot_number}`,
      plotsBefore: [{ ...original }],
      plotsAfter: [{ ...updated }]
    })

    setPlots(prev => prev.map(p => p.id === updated.id ? updated : p))
    setDirtyPlotIds(prev => new Set(prev).add(updated.id))
    setEditPlot(null)
    showToast(`Updated Plot #${updated.plot_number}`, 'success')
  }

  // Add Grid Cells Submit
  const handleAddGridSubmit = async () => {
    if (!actualTrialId) return
    setIsAddingGrid(true)
    try {
      await trials.addGridCells(actualTrialId, {
        type: gridAddType,
        location: gridAddLocation,
        count: gridAddCount,
        is_border: true,
      })
      showToast(`Added ${gridAddCount} ${gridAddType}(s) to field map!`, 'success')
      setShowAddGridModal(false)
      if (onRefresh) onRefresh()
    } catch (err: any) {
      showToast(`Failed to add grid cells: ${err.message || err}`, 'error')
    } finally {
      setIsAddingGrid(false)
    }
  }

  // Get Plot Cell Styling based on color mode
  function getPlotStyle(plot: Plot) {
    if (colorBy === 'no_fill') {
      if (plot.is_border) {
        return {
          background: 'repeating-linear-gradient(45deg, hsla(30, 40%, 45%, 0.15), hsla(30, 40%, 45%, 0.15) 6px, hsla(30, 40%, 30%, 0.3) 6px, hsla(30, 40%, 30%, 0.3) 12px)',
          border: '1px dashed hsl(30, 50%, 50%)',
          color: 'hsl(30, 70%, 75%)'
        }
      }
      return {
        background: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        border: plot.is_check ? '2px dashed var(--amber-500)' : '1px solid var(--border-subtle)',
      }
    }

    if (colorBy === 'border') {
      if (plot.is_border) {
        return {
          background: 'repeating-linear-gradient(45deg, hsla(30, 40%, 45%, 0.25), hsla(30, 40%, 45%, 0.25) 6px, hsla(30, 40%, 30%, 0.5) 6px, hsla(30, 40%, 30%, 0.5) 12px)',
          border: '2px dashed hsl(30, 80%, 50%)',
          color: 'hsl(30, 90%, 80%)'
        }
      }
      return {
        background: 'var(--bg-base)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)'
      }
    }

    if (colorBy === 'check') {
      if (plot.is_check) {
        return {
          background: 'rgba(245, 158, 11, 0.25)',
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
        planned: ['rgba(156, 163, 175, 0.15)', '#9ca3af', 'rgba(156, 163, 175, 0.4)'],
      }
      const [bg, col, brd] = statusColors[plot.status] || ['var(--bg-card)', 'var(--text-primary)', 'var(--border-default)']
      return { background: bg, color: col, border: `1px solid ${brd}` }
    }

    // Default / Accession: Same accession gets identical color across entire field
    if (plot.is_border) {
      return {
        background: 'repeating-linear-gradient(45deg, hsla(30, 40%, 45%, 0.15), hsla(30, 40%, 45%, 0.15) 6px, hsla(30, 40%, 30%, 0.3) 6px, hsla(30, 40%, 30%, 0.3) 12px)',
        border: '1px dashed hsl(30, 50%, 50%)',
        color: 'hsl(30, 70%, 75%)'
      }
    }
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

  const reps = useMemo(() => [...new Set(plots.map(p => p.rep))].sort((a, b) => a - b), [plots])
  const isAlpha = plots.some(p => p.incomplete_block !== null && p.incomplete_block !== undefined)
  const isGridded = plots.some(p => p.row !== null && p.column !== null)

  const distinctRows = useMemo(() => [...new Set(plots.filter(p => p.row !== null).map(p => p.row as number))].sort((a, b) => a - b), [plots])
  const distinctCols = useMemo(() => [...new Set(plots.filter(p => p.column !== null).map(p => p.column as number))].sort((a, b) => a - b), [plots])

  return (
    <div className={`plot-grid-container ${isPrintMode ? 'print-preview-mode' : ''}`} style={{ width: '100%' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`alert alert-${toastMessage.type === 'error' ? 'error' : toastMessage.type === 'success' ? 'success' : 'info'} mb-3`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>{toastMessage.text}</span>
          <button className="modal-close" onClick={() => setToastMessage(null)}>×</button>
        </div>
      )}

      {/* Main Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Field Map — {plots.length} plots</span>
            {isGridded && <span className="badge badge-gray">{distinctRows.length}R × {distinctCols.length}C Grid</span>}
          </div>

          {/* Lock / Unlock Toggle */}
          <button
            className={`btn btn-sm ${isLocked ? 'btn-secondary' : 'btn-primary'}`}
            style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => {
              if (!isLocked && dirtyPlotIds.size > 0) {
                if (window.confirm('You have unsaved changes. Lock map without saving? (Unsaved edits remain in-memory until saved)')) {
                  setIsLocked(true)
                  setIsPaintBorderMode(false)
                }
              } else {
                setIsLocked(!isLocked)
                if (isLocked) showToast('🔓 Map unlocked. Drag-and-drop, right-click menu, and editing are now active.', 'info')
                else setIsPaintBorderMode(false)
              }
            }}
            title={isLocked ? 'Click to unlock map for editing' : 'Click to lock map'}
          >
            {isLocked ? '🔒 Locked (View Only)' : '🔓 Unlocked (Editing Active)'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {/* Undo / Redo Buttons */}
          {!isLocked && (
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                title="Undo (Ctrl+Z)"
              >
                ↩️ Undo ({undoStack.length})
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                title="Redo (Ctrl+Y)"
              >
                ↪️ Redo ({redoStack.length})
              </button>
            </div>
          )}

          {/* Paint Border Mode Toggle */}
          {!isLocked && (
            <button
              className={`btn btn-sm ${isPaintBorderMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setIsPaintBorderMode(!isPaintBorderMode)}
              title="Click plots to toggle them as non-experimental border plots"
            >
              {isPaintBorderMode ? '🖌️ Painting Border Plots' : '🖌️ Paint Border'}
            </button>
          )}

          {/* Add Rows / Columns Button */}
          {!isLocked && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddGridModal(true)}
              title="Add border rows or columns to the field perimeter"
            >
              ➕ Add Rows/Cols
            </button>
          )}

          {/* Save Button (Dirty State) */}
          {!isLocked && dirtyPlotIds.size > 0 && (
            <button
              className="btn btn-primary btn-sm"
              style={{ background: 'var(--brand-600)', color: '#fff', fontWeight: 700, boxShadow: '0 0 10px var(--brand-400)' }}
              disabled={isSaving}
              onClick={handleSave}
            >
              {isSaving ? 'Saving…' : `💾 Save Changes (${dirtyPlotIds.size})`}
            </button>
          )}

          {/* Color By Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Color by:</span>
            <select
              className="form-input"
              style={{ width: 145, padding: '3px 8px', fontSize: '0.8rem', height: '28px' }}
              value={colorBy}
              onChange={e => setColorBy(e.target.value as ColorByOption)}
            >
              <option value="no_fill">No Fill (Default)</option>
              <option value="accession">Accession (Line)</option>
              <option value="check">Check vs Test</option>
              <option value="border">Border Plots</option>
              <option value="rep">Replication</option>
              {isAlpha && <option value="block">Incomplete Block</option>}
              <option value="status">Plot Status</option>
            </select>
          </div>

          {/* CSV Map Export */}
          {actualTrialId && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => trials.exportMap(actualTrialId)}
              title="Export Field Map CSV with Walking Order Serpentine Numbers"
            >
              📥 Export Map CSV
            </button>
          )}

          {/* Heatmap & Print Layout */}
          {actualTrialId && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowHeatmap(true)}
              title="View spatial field heatmap"
            >
              🌿 Heatmap
            </button>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsPrintMode(prev => !prev)}
            title="Toggle print layout"
          >
            🖨️ {isPrintMode ? 'Exit Print' : 'Print'}
          </button>
        </div>
      </div>

      {/* Spatial Heatmap Modal */}
      {actualTrialId && (
        <SpatialHeatmapModal
          trialId={actualTrialId}
          trialCode={actualTrialCode}
          isOpen={showHeatmap}
          onClose={() => setShowHeatmap(false)}
        />
      )}

      {/* RENDER MODE: Spatial Row x Column Grid */}
      {isGridded && distinctRows.length > 0 && distinctCols.length > 0 ? (
        <div style={{ overflowX: 'auto', paddingBottom: 'var(--space-2)' }}>
          <div
            className="plot-grid"
            style={{
              gridTemplateColumns: `repeat(${distinctCols.length}, minmax(95px, 1fr))`,
              gap: '6px',
              minWidth: `${distinctCols.length * 100}px`
            }}
          >
            {distinctRows.map(r =>
              distinctCols.map(c => {
                const plot = plots.find(p => p.row === r && p.column === c)
                if (!plot) {
                  return (
                    <div
                      key={`empty-${r}-${c}`}
                      className="plot-card"
                      style={{ opacity: 0.15, minHeight: '68px', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--r-sm)' }}
                    />
                  )
                }

                const style = getPlotStyle(plot)
                const isSelected = selectedPlots?.includes(plot.id)
                const isDragOver = dragOverPlotId === plot.id

                return (
                  <div
                    key={plot.id}
                    draggable={!isLocked && !isPaintBorderMode}
                    onDragStart={() => setDraggedPlotId(plot.id)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (!isLocked && dragOverPlotId !== plot.id) setDragOverPlotId(plot.id)
                    }}
                    onDragLeave={() => setDragOverPlotId(null)}
                    onDrop={() => handleDrop(plot)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (!isLocked) {
                        setContextMenu({ x: e.clientX, y: e.clientY, plot })
                      }
                    }}
                    className={`plot-card ${isSelected ? 'selected-row' : ''}`}
                    style={{
                      ...style,
                      cursor: isLocked ? (onSelectPlot ? 'pointer' : 'default') : isPaintBorderMode ? 'crosshair' : 'grab',
                      padding: '6px 8px',
                      minHeight: '68px',
                      borderRadius: 'var(--r-sm)',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      border: isDragOver ? '2px solid var(--brand-400)' : style.border,
                      boxShadow: isDragOver ? '0 0 12px var(--brand-400)' : 'none',
                      transition: 'all var(--transition-fast)'
                    }}
                    onClick={() => {
                      if (isPaintBorderMode) {
                        handleTogglePlotBorder(plot)
                      } else if (onSelectPlot) {
                        onSelectPlot(plot.id)
                      } else {
                        setInspectPlot(plot)
                      }
                    }}
                    onDoubleClick={() => !isLocked ? setEditPlot(plot) : setInspectPlot(plot)}
                    title={`Plot #${plot.plot_number} | Row ${r}, Col ${c} | Rep ${plot.rep} | ${plot.germplasm_name} (Double-click to edit)`}
                  >
                    {onSelectPlot && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{ position: 'absolute', top: 4, left: 4 }}
                      />
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono text-xs" style={{ fontWeight: 800, opacity: 0.9 }}>
                        #{plot.plot_number}
                      </span>
                      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                        {plot.is_border && (
                          <span style={{ fontSize: '8px', background: 'hsl(30, 70%, 40%)', color: '#fff', padding: '0 3px', borderRadius: '2px', fontWeight: 700 }}>
                            BORDER
                          </span>
                        )}
                        {plot.is_check && (
                          <span style={{ fontSize: '8px', background: 'var(--amber-500)', color: '#000', padding: '0 3px', borderRadius: '2px', fontWeight: 700 }}>
                            CHECK
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className="font-semibold text-xs"
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '2px'
                      }}
                    >
                      {plot.germplasm_name}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', opacity: 0.7, marginTop: '2px' }}>
                      <span className="font-mono">R:{r} C:{c}</span>
                      <span className="font-mono">Rep {plot.rep}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : (
        /* Standard Flow / By Replication */
        reps.map(repNum => {
          const repPlots = plots.filter(p => p.rep === repNum).sort((a, b) => a.plot_number - b.plot_number)
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
                    <div className="plot-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '6px' }}>
                      {blockPlots.map(plot => {
                        const style = getPlotStyle(plot)
                        const isSelected = selectedPlots?.includes(plot.id)
                        const isDragOver = dragOverPlotId === plot.id

                        return (
                          <div
                            key={plot.id}
                            draggable={!isLocked && !isPaintBorderMode}
                            onDragStart={() => setDraggedPlotId(plot.id)}
                            onDragOver={(e) => {
                              e.preventDefault()
                              if (!isLocked && dragOverPlotId !== plot.id) setDragOverPlotId(plot.id)
                            }}
                            onDragLeave={() => setDragOverPlotId(null)}
                            onDrop={() => handleDrop(plot)}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              if (!isLocked) {
                                setContextMenu({ x: e.clientX, y: e.clientY, plot })
                              }
                            }}
                            className={`plot-cell ${plot.is_check ? 'check-plot' : ''} ${isSelected ? 'selected-row' : ''}`}
                            style={{
                              ...style,
                              borderRadius: '4px',
                              padding: '6px 8px',
                              cursor: isLocked ? (onSelectPlot ? 'pointer' : 'default') : isPaintBorderMode ? 'crosshair' : 'grab',
                              minHeight: '64px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              position: 'relative',
                              border: isDragOver ? '2px solid var(--brand-400)' : style.border,
                              boxShadow: isDragOver ? '0 0 10px var(--brand-400)' : 'none'
                            }}
                            onClick={() => {
                              if (isPaintBorderMode) {
                                handleTogglePlotBorder(plot)
                              } else if (onSelectPlot) {
                                onSelectPlot(plot.id)
                              } else {
                                setInspectPlot(plot)
                              }
                            }}
                            onDoubleClick={() => !isLocked ? setEditPlot(plot) : setInspectPlot(plot)}
                            title={`Plot #${plot.plot_number} | Rep ${plot.rep} | ${plot.germplasm_name}`}
                          >
                            {onSelectPlot && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                style={{ position: 'absolute', top: 4, left: 4 }}
                              />
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="plot-num font-mono text-xs" style={{ opacity: 0.85, fontWeight: 700 }}>
                                #{plot.plot_number}
                              </span>
                              <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                <StatusBadge status={plot.status} />
                                {plot.is_border && (
                                  <span style={{ fontSize: '8px', background: 'hsl(30, 70%, 40%)', color: '#fff', padding: '0 3px', borderRadius: '2px', fontWeight: 700 }}>
                                    BORDER
                                  </span>
                                )}
                                {plot.is_check && (
                                  <span style={{ fontSize: '8px', background: 'var(--amber-500)', color: '#000', padding: '0 4px', borderRadius: '3px', fontWeight: 700 }}>
                                    CHECK
                                  </span>
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

      {/* Accession Color Legend */}
      {colorBy === 'accession' && (
        <div className="flex gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
          {germplasmIds.map((id, idx) => {
            const name = plots.find(p => p.germplasm === id)?.germplasm_name ?? String(id)
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

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: `Copy "${contextMenu.plot.germplasm_name}"`,
              icon: '📋',
              onClick: () => handleContextMenuAction('copy', contextMenu.plot)
            },
            {
              label: clipboard ? `Paste "${clipboard.germplasm_name}"` : 'Paste (Clipboard empty)',
              icon: '📌',
              disabled: !clipboard,
              onClick: () => handleContextMenuAction('paste', contextMenu.plot)
            },
            'divider',
            {
              label: contextMenu.plot.is_border ? 'Remove Border Designation' : 'Mark as Border Plot',
              icon: '🌿',
              onClick: () => handleContextMenuAction('toggle_border', contextMenu.plot)
            },
            {
              label: 'Edit Plot Details',
              icon: '✏️',
              onClick: () => handleContextMenuAction('edit', contextMenu.plot)
            },
            'divider',
            {
              label: 'Clear / Remove Plot Entry',
              icon: '🗑️',
              danger: true,
              onClick: () => handleContextMenuAction('remove', contextMenu.plot)
            },
          ]}
        />
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
                  {inspectPlot.is_border ? (
                    <span className="badge badge-amber">Protective Border Filler</span>
                  ) : inspectPlot.is_check ? (
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

      {/* Edit Plot Modal */}
      {editPlot && (
        <Modal title={`Edit Plot #${editPlot.plot_number}`} onClose={() => setEditPlot(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="form-group">
              <label className="form-label">Germplasm Entry</label>
              <select
                className="form-input"
                value={editPlot.germplasm}
                onChange={e => {
                  const gid = Number(e.target.value)
                  const germ = availableGermplasm.find(g => g.id === gid)
                  setEditPlot({
                    ...editPlot,
                    germplasm: gid,
                    germplasm_name: germ ? germ.name : editPlot.germplasm_name
                  })
                }}
              >
                {availableGermplasm.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.germplasm_db_id})</option>
                ))}
              </select>
            </div>

            <div className="grid-2 gap-3">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={editPlot.status}
                  onChange={e => setEditPlot({ ...editPlot, status: e.target.value })}
                >
                  <option value="planned">Planned</option>
                  <option value="planted">Planted</option>
                  <option value="harvested">Harvested</option>
                  <option value="discarded">Discarded</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Replication</label>
                <input
                  type="number"
                  className="form-input"
                  value={editPlot.rep}
                  onChange={e => setEditPlot({ ...editPlot, rep: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editPlot.is_check}
                  onChange={e => setEditPlot({ ...editPlot, is_check: e.target.checked })}
                />
                <span className="text-sm">Reference Check Line</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editPlot.is_border || false}
                  onChange={e => setEditPlot({ ...editPlot, is_border: e.target.checked })}
                />
                <span className="text-sm">Protective Border Plot</span>
              </label>
            </div>

            <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary" onClick={() => setEditPlot(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleSaveEditPlot(editPlot)}>Update Plot</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Rows / Columns Modal */}
      {showAddGridModal && (
        <Modal title="Add Field Border Rows / Columns" onClose={() => setShowAddGridModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="form-group">
              <label className="form-label">Element Type</label>
              <select
                className="form-input"
                value={gridAddType}
                onChange={e => {
                  const val = e.target.value as 'row' | 'column'
                  setGridAddType(val)
                  setGridAddLocation(val === 'row' ? 'top' : 'right')
                }}
              >
                <option value="row">Add Rows</option>
                <option value="column">Add Columns</option>
              </select>
            </div>

            <div className="grid-2 gap-3">
              <div className="form-group">
                <label className="form-label">Perimeter Location</label>
                <select
                  className="form-input"
                  value={gridAddLocation}
                  onChange={e => setGridAddLocation(e.target.value as any)}
                >
                  {gridAddType === 'row' ? (
                    <>
                      <option value="top">Top (North Perimeter)</option>
                      <option value="bottom">Bottom (South Perimeter)</option>
                    </>
                  ) : (
                    <>
                      <option value="left">Left (West Perimeter)</option>
                      <option value="right">Right (East Perimeter)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Count (1 - 10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="form-input"
                  value={gridAddCount}
                  onChange={e => setGridAddCount(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddGridModal(false)} disabled={isAddingGrid}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddGridSubmit} disabled={isAddingGrid}>
                {isAddingGrid ? 'Adding to Field…' : 'Add to Field Map'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

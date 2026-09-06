import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { trials, germplasm, Trial, Germplasm, ApiError } from '../../api/client'
import { DESIGN_TYPES, DESIGN_TYPE_LABELS } from './types'
import { DataTable, Column } from '../common/DataTable'

interface MapCreationWizardProps {
  trial: Trial
  onClose: () => void
  onSuccess: () => void
}

export default function MapCreationWizard({ trial, onClose, onSuccess }: MapCreationWizardProps) {
  const [step, setStep] = useState<number>(1)

  // Step 1: Design params
  const [designType, setDesignType] = useState<string>(trial.design_type || 'RCBD')
  const [numReps, setNumReps] = useState<number>(trial.num_reps || 1)
  const [blockSize, setBlockSize] = useState<number>(trial.block_size || 4)
  const [prepFraction, setPrepFraction] = useState<number>(trial.prep_fraction || 0.5)

  // Step 2: Germplasm selection
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [checkIds, setCheckIds] = useState<number[]>([])

  // Step 3: Spatial Configuration
  const [fieldRows, setFieldRows] = useState<number | ''>('')
  const [fieldCols, setFieldCols] = useState<number | ''>('')
  const [startingCorner, setStartingCorner] = useState<'BL' | 'BR' | 'TL' | 'TR'>('BL')
  const [advancementDirection] = useState<'up' | 'right' | 'up_right' | 'right_up'>('up')
  const [layoutSchema, setLayoutSchema] = useState<'h_serpentine' | 'v_serpentine' | 'h_cartesian' | 'v_cartesian'>('h_serpentine')

  // Step 4: Border & Randomization
  const [seed, setSeed] = useState<string>('')
  const [addBorders, setAddBorders] = useState<boolean>(false)
  const [borderRows, setBorderRows] = useState<number>(1)
  const [borderCols, setBorderCols] = useState<number>(1)
  const [borderGermplasmId, setBorderGermplasmId] = useState<number | null>(null)

  const [error, setError] = useState<string>('')

  // Load Program Germplasm
  const { data: germplasmData } = useQuery({
    queryKey: ['program-germplasm', trial.program],
    queryFn: () => germplasm.list(`&page_size=500&program=${trial.program}`),
  })

  const programGermplasm: Germplasm[] = germplasmData?.results ?? []

  useEffect(() => {
    if (programGermplasm.length > 0 && selectedIds.length === 0) {
      setSelectedIds(programGermplasm.map((g: Germplasm) => g.id))
    }
  }, [programGermplasm])

  // Design checks
  const isAlpha = designType === 'alpha_lattice' || designType === 'augmented_block'
  const isAugmented = designType === 'augmented' || designType === 'augmented_block' || designType === 'prep'
  const isLatinSquare = designType === 'latin_square'

  // Entry count calculations
  const totalEntriesCount = selectedIds.length
  const totalPlotsEstimated = useMemo(() => {
    if (designType === 'latin_square') {
      return totalEntriesCount * totalEntriesCount
    }
    if (designType === 'prep') {
      const checks = checkIds.length
      const tests = totalEntriesCount - checks
      return checks * 2 + tests + Math.round(tests * prepFraction)
    }
    if (designType === 'augmented') {
      const checks = checkIds.length
      const tests = totalEntriesCount - checks
      return checks * numReps + tests
    }
    if (designType === 'augmented_block') {
      const checks = checkIds.length
      const tests = totalEntriesCount - checks
      const numBlocks = Math.ceil(tests / blockSize) || 1
      return checks * numBlocks + tests
    }
    if (designType === 'unreplicated') {
      return totalEntriesCount
    }
    return totalEntriesCount * numReps
  }, [designType, totalEntriesCount, checkIds.length, numReps, blockSize, prepFraction])

  // Recommended Dimensions
  const recommendedCols = useMemo(() => {
    if (isLatinSquare) return totalEntriesCount
    const plots = totalPlotsEstimated || 1
    return Math.max(1, Math.ceil(Math.sqrt(plots)))
  }, [totalPlotsEstimated, isLatinSquare, totalEntriesCount])

  const recommendedRows = useMemo(() => {
    if (isLatinSquare) return totalEntriesCount
    const cols = recommendedCols || 1
    return Math.max(1, Math.ceil((totalPlotsEstimated || 1) / cols))
  }, [totalPlotsEstimated, recommendedCols, isLatinSquare, totalEntriesCount])

  // Auto-fill recommended dimensions if blank
  useEffect(() => {
    if (fieldCols === '' && recommendedCols > 0) {
      setFieldCols(recommendedCols)
    }
    if (fieldRows === '' && recommendedRows > 0) {
      setFieldRows(recommendedRows)
    }
  }, [recommendedCols, recommendedRows])

  // Divisibility validation
  const countOk = !isAlpha || (totalEntriesCount > 0 && totalEntriesCount % blockSize === 0)
  const remainder = isAlpha && totalEntriesCount > 0 ? totalEntriesCount % blockSize : 0
  const latinSquareOk = !isLatinSquare || (totalEntriesCount > 0 && totalEntriesCount <= 30)

  // 6x6 Preview Grid Plot Generation
  const previewGrid = useMemo(() => {
    const PREVIEW_SIZE = 6
    const grid: { plotNum: number; row: number; col: number; isStart: boolean }[][] = []

    for (let r = 0; r < PREVIEW_SIZE; r++) {
      grid[r] = []
      for (let c = 0; c < PREVIEW_SIZE; c++) {
        grid[r][c] = { plotNum: 0, row: r + 1, col: c + 1, isStart: false }
      }
    }

    const isBottom = startingCorner === 'BL' || startingCorner === 'BR'
    const isLeft = startingCorner === 'BL' || startingCorner === 'TL'

    for (let idx = 0; idx < PREVIEW_SIZE * PREVIEW_SIZE; idx++) {
      let rIdx = 0
      let cIdx = 0

      if (layoutSchema === 'h_serpentine' || layoutSchema === 'h_cartesian') {
        rIdx = Math.floor(idx / PREVIEW_SIZE)
        cIdx = idx % PREVIEW_SIZE
        if (layoutSchema === 'h_serpentine' && rIdx % 2 === 1) {
          cIdx = (PREVIEW_SIZE - 1) - cIdx
        }
      } else {
        cIdx = Math.floor(idx / PREVIEW_SIZE)
        rIdx = idx % PREVIEW_SIZE
        if (layoutSchema === 'v_serpentine' && cIdx % 2 === 1) {
          rIdx = (PREVIEW_SIZE - 1) - rIdx
        }
      }

      const gridRow = isBottom ? (PREVIEW_SIZE - 1 - rIdx) : rIdx
      const gridCol = isLeft ? cIdx : (PREVIEW_SIZE - 1 - cIdx)

      if (grid[gridRow] && grid[gridRow][gridCol]) {
        grid[gridRow][gridCol].plotNum = idx + 1
        grid[gridRow][gridCol].isStart = idx === 0
      }
    }

    return grid
  }, [startingCorner, layoutSchema])

  // Create Plots Mutation
  const mutation = useMutation({
    mutationFn: async () => {
      // 1. Update trial metadata if changed
      await trials.update(trial.id, {
        design_type: designType,
        num_reps: isLatinSquare ? 1 : numReps,
        block_size: isAlpha ? blockSize : null,
        prep_fraction: designType === 'prep' ? prepFraction : null,
        field_rows: Number(fieldRows) || recommendedRows,
        field_cols: Number(fieldCols) || recommendedCols,
        starting_corner: startingCorner,
        advancement_direction: advancementDirection,
        layout_schema: layoutSchema,
      })

      // 2. Generate plots
      return trials.createPlots(trial.id, {
        germplasm_ids: selectedIds,
        seed: seed ? Number(seed) : undefined,
        check_germplasm_ids: isAugmented ? checkIds : undefined,
      })
    },
    onSuccess: () => {
      onSuccess()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
    }
  })

  // Columns for Germplasm DataTable
  const columns: Column<Germplasm>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Line / Entry Name',
      sortable: true,
      searchable: true,
      render: (g: Germplasm) => <span className="font-semibold text-sm">{g.name}</span>
    },
    {
      key: 'germplasm_db_id',
      header: 'Accession DB ID',
      sortable: true,
      searchable: true,
      render: (g: Germplasm) => <code className="font-mono text-xs">{g.germplasm_db_id}</code>
    },
    {
      key: 'species',
      header: 'Species',
      sortable: true,
      searchable: true,
    },
    ...(isAugmented ? [{
      key: 'is_check',
      header: 'Reference Check?',
      sortable: false,
      searchable: false,
      render: (g: Germplasm) => {
        const isSelected = selectedIds.includes(g.id)
        const isCheck = checkIds.includes(g.id)
        return (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: isSelected ? 'pointer' : 'not-allowed', opacity: isSelected ? 1 : 0.4 }}>
            <input
              type="checkbox"
              disabled={!isSelected}
              checked={isCheck}
              onChange={(e) => {
                e.stopPropagation()
                setCheckIds(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: isCheck ? 700 : 400, color: isCheck ? 'var(--amber-400)' : 'inherit' }}>
              {isCheck ? 'CHECK' : 'Test Entry'}
            </span>
          </label>
        )
      }
    }] : [])
  ], [isAugmented, selectedIds, checkIds])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minHeight: '520px' }}>
      {/* Wizard Step Progress Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
        {[
          { num: 1, label: '1. Design' },
          { num: 2, label: '2. Germplasm' },
          { num: 3, label: '3. Field Layout' },
          { num: 4, label: '4. Border & Seed' },
          { num: 5, label: '5. Review' }
        ].map(s => (
          <button
            key={s.num}
            onClick={() => setStep(s.num)}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontWeight: step === s.num ? 700 : 500,
              color: step === s.num ? 'var(--brand-300)' : step > s.num ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '0.85rem'
            }}
          >
            <span
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                background: step === s.num ? 'var(--brand-500)' : step > s.num ? 'var(--brand-800)' : 'var(--bg-card)',
                color: step === s.num ? '#fff' : 'inherit',
                border: `1px solid ${step === s.num ? 'var(--brand-400)' : 'var(--border-subtle)'}`
              }}
            >
              {step > s.num ? '✓' : s.num}
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: TRIAL DESIGN CONFIGURATION */}
      {step === 1 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <h4 style={{ margin: '0 0 var(--space-1) 0' }}>Step 1: Choose Experimental Design</h4>
            <p className="text-sm text-muted">Select the statistical design and replication parameters for this field trial.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
            {DESIGN_TYPES.map(dtype => (
              <div
                key={dtype}
                onClick={() => {
                  setDesignType(dtype)
                  if (dtype === 'latin_square') setNumReps(1)
                }}
                className={`card ${designType === dtype ? 'selected-row' : ''}`}
                style={{
                  cursor: 'pointer',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--r-md)',
                  border: designType === dtype ? '2px solid var(--brand-400)' : '1px solid var(--border-subtle)',
                  background: designType === dtype ? 'hsla(var(--hue-brand), 52%, 40%, 0.15)' : 'var(--bg-card)',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: designType === dtype ? 'var(--brand-300)' : 'var(--text-primary)' }}>
                  {DESIGN_TYPE_LABELS[dtype] || dtype}
                </div>
              </div>
            ))}
          </div>

          <div className="grid-2 gap-4" style={{ marginTop: 'var(--space-2)' }}>
            <div className="form-group">
              <label className="form-label">Number of Replications</label>
              <input
                type="number"
                min="1"
                max="20"
                disabled={isLatinSquare}
                className="form-input"
                value={isLatinSquare ? 1 : numReps}
                onChange={e => setNumReps(Math.max(1, parseInt(e.target.value) || 1))}
              />
              {isLatinSquare && <span className="text-xs text-muted">Latin Square designs strictly require 1 replication.</span>}
            </div>

            {isAlpha && (
              <div className="form-group">
                <label className="form-label">Block Size (Plots per Incomplete Block)</label>
                <input
                  type="number"
                  min="2"
                  max="100"
                  className="form-input"
                  value={blockSize}
                  onChange={e => setBlockSize(Math.max(2, parseInt(e.target.value) || 2))}
                />
              </div>
            )}

            {designType === 'prep' && (
              <div className="form-group">
                <label className="form-label">P-Rep Fraction (0.1 to 1.0)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="1.0"
                  className="form-input"
                  value={prepFraction}
                  onChange={e => setPrepFraction(parseFloat(e.target.value) || 0.5)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: GERMPLASM SELECTION */}
      {step === 2 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: '0 0 var(--space-1) 0' }}>Step 2: Select Germplasm Entries</h4>
              <p className="text-sm text-muted">Choose candidate accessions and designate reference checks.</p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedIds(programGermplasm.map(g => g.id))}
              >
                Select All ({programGermplasm.length})
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setSelectedIds([]); setCheckIds([]) }}
              >
                Deselect All
              </button>
            </div>
          </div>

          {isAlpha && (
            <div className={`alert ${countOk ? 'alert-success' : 'alert-error'}`} style={{ padding: '8px 12px' }}>
              <span>ℹ</span>
              <span>
                Selected entries: <strong>{totalEntriesCount}</strong> | Block size: <strong>{blockSize}</strong>.
                {countOk ? ' Divisibility check passed!' : ` Entry count must be divisible by ${blockSize} (remainder: ${remainder}).`}
              </span>
            </div>
          )}

          {isLatinSquare && (
            <div className={`alert ${latinSquareOk ? 'alert-success' : 'alert-error'}`} style={{ padding: '8px 12px' }}>
              <span>ℹ</span>
              <span>
                Selected entries: <strong>{totalEntriesCount}</strong> (Produces a {totalEntriesCount}×{totalEntriesCount} field).
                {latinSquareOk ? ' Valid size.' : ' Latin Square requires between 2 and 30 entries.'}
              </span>
            </div>
          )}

          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={programGermplasm}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={(newIds) => setSelectedIds(newIds as number[])}
              stickyHeader
              maxHeight="320px"
              pagination
              defaultPageSize={50}
              emptyMessage="No germplasm found in this program."
            />
          </div>
        </div>
      )}

      {/* STEP 3: FIELD DIMENSIONS & SPATIAL LAYOUT */}
      {step === 3 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <h4 style={{ margin: '0 0 var(--space-1) 0' }}>Step 3: Field Layout & Dimensions</h4>
            <p className="text-sm text-muted">Configure spatial grid dimensions, sowing path direction, and starting corner.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            {/* Left Column: Dimensions and Parameters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ background: 'var(--bg-card)', padding: 'var(--space-3)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Plots to Place:</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-300)' }}>
                  {totalPlotsEstimated} plots
                </div>
              </div>

              <div className="grid-2 gap-3">
                <div className="form-group">
                  <label className="form-label">
                    Columns <span className="text-muted">(recommended: {recommendedCols})</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={fieldCols}
                    onChange={e => setFieldCols(parseInt(e.target.value) || '')}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Rows <span className="text-muted">(recommended: {recommendedRows})</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={fieldRows}
                    onChange={e => setFieldRows(parseInt(e.target.value) || '')}
                  />
                </div>
              </div>

              {/* Starting Corner */}
              <div className="form-group">
                <label className="form-label">Starting Corner (Sowing Start / Plot #1)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    { id: 'TL', label: '↖ Top-Left (TL)' },
                    { id: 'TR', label: '↗ Top-Right (TR)' },
                    { id: 'BL', label: '↙ Bottom-Left (BL)' },
                    { id: 'BR', label: '↘ Bottom-Right (BR)' },
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setStartingCorner(c.id as any)}
                      className="btn btn-sm"
                      style={{
                        background: startingCorner === c.id ? 'var(--brand-600)' : 'var(--bg-card)',
                        color: startingCorner === c.id ? '#fff' : 'var(--text-primary)',
                        border: `1px solid ${startingCorner === c.id ? 'var(--brand-400)' : 'var(--border-subtle)'}`,
                        fontWeight: startingCorner === c.id ? 700 : 400
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout Schema */}
              <div className="form-group">
                <label className="form-label">Layout Schema & Walking Order</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    { id: 'h_serpentine', label: '↔ Horizontal Serpentine' },
                    { id: 'v_serpentine', label: '↕ Vertical Serpentine' },
                    { id: 'h_cartesian', label: '→ Horizontal Cartesian' },
                    { id: 'v_cartesian', label: '↓ Vertical Cartesian' },
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setLayoutSchema(s.id as any)}
                      className="btn btn-sm"
                      style={{
                        background: layoutSchema === s.id ? 'var(--brand-600)' : 'var(--bg-card)',
                        color: layoutSchema === s.id ? '#fff' : 'var(--text-primary)',
                        border: `1px solid ${layoutSchema === s.id ? 'var(--brand-400)' : 'var(--border-subtle)'}`,
                        fontSize: '0.75rem',
                        fontWeight: layoutSchema === s.id ? 700 : 400
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Dynamic 6x6 Preview Grid */}
            <div style={{ background: 'var(--bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 'var(--space-2)' }}>
                <span className="text-xs font-semibold text-muted">LIVE 6×6 PREVIEW GRID</span>
                <span className="badge badge-green">Start: {startingCorner}</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '4px',
                  width: '100%',
                  maxWidth: '280px',
                  aspectRatio: '1/1',
                  background: 'var(--bg-elevated)',
                  padding: '8px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-default)'
                }}
              >
                {previewGrid.map((row, rIdx) =>
                  row.map((cell, cIdx) => (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: cell.isStart ? 'var(--brand-500)' : 'var(--bg-card)',
                        color: cell.isStart ? '#fff' : 'var(--text-secondary)',
                        borderRadius: '2px',
                        fontSize: '0.7rem',
                        fontWeight: cell.isStart ? 800 : 500,
                        border: cell.isStart ? '1px solid #fff' : '1px solid var(--border-subtle)',
                        boxShadow: cell.isStart ? '0 0 8px var(--brand-400)' : 'none'
                      }}
                    >
                      <span>#{cell.plotNum}</span>
                      {cell.isStart && <span style={{ fontSize: '8px', fontWeight: 700 }}>START</span>}
                    </div>
                  ))
                )}
              </div>

              <div className="text-xs text-muted" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
                Illustrative 6×6 preview showing the relative walking / sowing trajectory across rows and columns.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: BORDER PLOTS & RANDOMIZATION */}
      {step === 4 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <h4 style={{ margin: '0 0 var(--space-1) 0' }}>Step 4: Border Plots & Randomization Seed</h4>
            <p className="text-sm text-muted">Optionally add protective non-experimental border strips around the field.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Randomization Seed (Optional)</label>
            <input
              className="form-input"
              type="number"
              placeholder="e.g. 42 (leave blank for random)"
              value={seed}
              onChange={e => setSeed(e.target.value)}
            />
            <span className="text-xs text-muted">Setting a fixed seed ensures reproducible randomized plot layouts.</span>
          </div>

          <div className="card" style={{ background: 'var(--bg-card)', padding: 'var(--space-4)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={addBorders}
                onChange={e => setAddBorders(e.target.checked)}
              />
              <span>🌿 Add Protective Border Plots (PHENOME Style)</span>
            </label>
            <p className="text-xs text-muted" style={{ margin: '4px 0 12px 24px' }}>
              Surround the trial with filler variety plots to buffer experimental lines against edge and wind effects.
            </p>

            {addBorders && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingLeft: '24px' }}>
                <div className="grid-2 gap-3">
                  <div className="form-group">
                    <label className="form-label">Border Rows (Top & Bottom)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      className="form-input"
                      value={borderRows}
                      onChange={e => setBorderRows(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Border Columns (Left & Right)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      className="form-input"
                      value={borderCols}
                      onChange={e => setBorderCols(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Border Filler Germplasm</label>
                  <select
                    className="form-input"
                    value={borderGermplasmId || ''}
                    onChange={e => setBorderGermplasmId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Default (First Reference Check / Bulk)</option>
                    {programGermplasm.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.germplasm_db_id})</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW & GENERATE */}
      {step === 5 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <h4 style={{ margin: '0 0 var(--space-1) 0' }}>Step 5: Review & Generate Field Map</h4>
            <p className="text-sm text-muted">Confirm all parameters before generating experimental plots.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            <div className="stat-card">
              <span className="text-xs text-muted">Design Type</span>
              <span className="font-semibold text-brand">{DESIGN_TYPE_LABELS[designType] || designType}</span>
            </div>
            <div className="stat-card">
              <span className="text-xs text-muted">Entries Selected</span>
              <span className="font-semibold">{selectedIds.length} candidate lines</span>
            </div>
            <div className="stat-card">
              <span className="text-xs text-muted">Total Plots</span>
              <span className="font-semibold">{totalPlotsEstimated} plots</span>
            </div>
            <div className="stat-card">
              <span className="text-xs text-muted">Field Grid Dimensions</span>
              <span className="font-semibold">{fieldRows || recommendedRows} Rows × {fieldCols || recommendedCols} Cols</span>
            </div>
            <div className="stat-card">
              <span className="text-xs text-muted">Starting Corner</span>
              <span className="font-semibold">{startingCorner}</span>
            </div>
            <div className="stat-card">
              <span className="text-xs text-muted">Layout Schema</span>
              <span className="font-semibold">{layoutSchema}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal Navigation Footer */}
      <div className="modal-footer" style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between' }}>
        <button
          className="btn btn-secondary"
          onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
          disabled={mutation.isPending}
        >
          {step === 1 ? 'Cancel' : '‹ Previous Step'}
        </button>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {step < 5 ? (
            <button
              className="btn btn-primary"
              disabled={
                (step === 1 && !countOk) ||
                (step === 2 && (selectedIds.length === 0 || !countOk || !latinSquareOk))
              }
              onClick={() => setStep(s => s + 1)}
            >
              Next Step ›
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={mutation.isPending || selectedIds.length === 0 || !countOk || !latinSquareOk}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  Generating Field Map…
                </>
              ) : (
                '🚀 Generate Field Map'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

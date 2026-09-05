import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { seedLots, programs, germplasm, SeedLot, Program, Germplasm, ApiError, BarcodeLabelData } from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

export default function SeedInventory() {
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder' || role === 'technician'

  const [search, setSearch] = useState('')
  const [selectedProgram, setSelectedProgram] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [adjustLot, setAdjustLot] = useState<SeedLot | null>(null)
  const [labelLot, setLabelLot] = useState<SeedLot | null>(null)
  const [deleteLot, setDeleteLot] = useState<SeedLot | null>(null)

  const params = [
    search ? `&search=${encodeURIComponent(search)}` : '',
    selectedProgram ? `&program=${encodeURIComponent(selectedProgram)}` : '',
    selectedStatus ? `&status=${encodeURIComponent(selectedStatus)}` : '',
  ].join('')

  const qc = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['seed-lots', search, selectedProgram, selectedStatus],
    queryFn: () => seedLots.list(params),
    placeholderData: prev => prev,
  })

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })

  const { data: germplasmData } = useQuery({
    queryKey: ['germplasm-all'],
    queryFn: () => germplasm.listAll(),
    enabled: showCreate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => seedLots.destroy(deleteLot!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seed-lots'] })
      setDeleteLot(null)
    },
  })

  const programList = programsData?.results ?? []
  const germplasmList = germplasmData?.results ?? []
  const lotList = (data?.results ?? []).filter(lot => 
    showLowStockOnly ? lot.is_low_stock : true
  )

  // Summary statistics
  const totalWeightGrams = lotList.reduce((acc, l) => acc + (l.quantity_grams || 0), 0)
  const lowStockCount = (data?.results ?? []).filter(l => l.is_low_stock).length
  const depletedCount = (data?.results ?? []).filter(l => l.status === 'depleted').length

  return (
    <div className="page-shell">
      <TopBar
        title="Seed Inventory & Barcode Tracking"
        subtitle={`${data?.count ?? 0} seed packets tracked · ${(totalWeightGrams / 1000).toFixed(2)} kg in storage`}
        actions={canWrite ? (
          <div className="flex gap-2">
            <button 
              id="add-seed-lot-btn"
              className="btn btn-primary" 
              onClick={() => setShowCreate(true)}
            >
              + Register Seed Lot
            </button>
          </div>
        ) : undefined}
      />

      {/* Summary KPI Cards */}
      <div className="kpi-grid mb-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="text-xs text-muted">Total Seed Packets</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-400)', marginTop: 4 }}>
            {data?.count ?? 0}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="text-xs text-muted">Total Vault Weight</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 4 }}>
            {(totalWeightGrams / 1000).toFixed(2)} <span className="text-sm font-normal text-muted">kg</span>
          </div>
        </div>
        <div 
          className="card" 
          style={{ 
            padding: 'var(--space-4)',
            cursor: 'pointer',
            borderColor: showLowStockOnly ? 'var(--status-warning)' : 'var(--border-color)',
            backgroundColor: showLowStockOnly ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface-card)'
          }}
          onClick={() => setShowLowStockOnly(prev => !prev)}
        >
          <div className="text-xs text-muted flex items-center justify-between">
            <span>Low Stock (&lt; 50g)</span>
            {lowStockCount > 0 && <span className="badge badge-amber">{lowStockCount}</span>}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: lowStockCount > 0 ? '#f59e0b' : 'var(--text-primary)', marginTop: 4 }}>
            {lowStockCount}
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="text-xs text-muted">Depleted Packets</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
            {depletedCount}
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="toolbar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            id="seed-search"
            type="search"
            placeholder="Search lot code, accession, room/shelf…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          id="seed-program-filter"
          className="form-input"
          style={{ width: 180 }}
          value={selectedProgram}
          onChange={e => setSelectedProgram(e.target.value)}
        >
          <option value="">All Programs</option>
          {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select
          id="seed-status-filter"
          className="form-input"
          style={{ width: 150 }}
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="depleted">Depleted</option>
          <option value="reserved">Reserved</option>
          <option value="quarantine">Quarantine</option>
        </select>

        {isFetching && !isLoading && (
          <div className="spinner" style={{ width: 16, height: 16 }} />
        )}
      </div>

      {/* Main Seed Lots Table */}
      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading seed inventory…</div>
      ) : lotList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <p>No seed lots found matching your filter criteria.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lot Code</th>
                <th>Accession / Line</th>
                <th>Remaining Balance</th>
                <th>Seed Count</th>
                <th>Storage Location</th>
                <th>Harvest Date</th>
                <th>Source Plot</th>
                <th>Status</th>
                <th style={{ width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lotList.map(lot => (
                <tr key={lot.id}>
                  <td>
                    <strong className="font-mono text-xs" style={{ color: 'var(--brand-300)' }}>
                      {lot.lot_code}
                    </strong>
                  </td>
                  <td>
                    <div><strong>{lot.germplasm_name}</strong></div>
                    <div className="font-mono text-xs text-muted">{lot.germplasm_db_id}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{lot.quantity_grams} g</span>
                      {lot.is_low_stock && (
                        <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>Low Stock</span>
                      )}
                    </div>
                  </td>
                  <td className="text-sm text-muted">
                    {lot.seed_count ? `~${lot.seed_count.toLocaleString()} seeds` : '—'}
                  </td>
                  <td>
                    <span className="badge badge-gray font-mono" style={{ fontSize: '0.75rem' }}>
                      📍 {lot.storage_location}
                    </span>
                  </td>
                  <td className="text-sm text-muted">{lot.harvest_date ?? '—'}</td>
                  <td className="text-sm text-muted">
                    {lot.source_plot_number ? `Plot #${lot.source_plot_number}` : '—'}
                  </td>
                  <td>
                    <span className={`badge ${
                      lot.status === 'available' ? 'badge-green' : lot.status === 'depleted' ? 'badge-gray' : 'badge-amber'
                    }`}>
                      {lot.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1.5">
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Print Barcode Envelope Sticker"
                        onClick={() => setLabelLot(lot)}
                      >
                        🏷️
                      </button>
                      {canWrite && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Adjust / Deduct Seed"
                            onClick={() => setAdjustLot(lot)}
                          >
                            ⚖️
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Delete Lot"
                            style={{ color: 'var(--status-danger)' }}
                            onClick={() => setDeleteLot(lot)}
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Register Seed Lot */}
      {showCreate && (
        <Modal title="Register New Seed Lot" onClose={() => setShowCreate(false)}>
          <CreateSeedLotForm
            programList={programList}
            germplasmList={germplasmList}
            onClose={() => setShowCreate(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['seed-lots'] })
              setShowCreate(false)
            }}
          />
        </Modal>
      )}

      {/* Modal 2: Adjust Inventory / Log Deduction */}
      {adjustLot && (
        <Modal title={`Adjust Seed Inventory — ${adjustLot.lot_code}`} onClose={() => setAdjustLot(null)}>
          <AdjustSeedForm
            lot={adjustLot}
            onClose={() => setAdjustLot(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['seed-lots'] })
              setAdjustLot(null)
            }}
          />
        </Modal>
      )}

      {/* Modal 3: Print Barcode Label */}
      {labelLot && (
        <Modal title={`Print Barcode Sticker — ${labelLot.lot_code}`} onClose={() => setLabelLot(null)}>
          <BarcodeLabelModalContent lot={labelLot} onClose={() => setLabelLot(null)} />
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteLot && (
        <ConfirmDialog
          message={`Delete seed lot "${deleteLot.lot_code}" (${deleteLot.germplasm_name})? This will permanently delete its transaction history.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteLot(null)}
        />
      )}
    </div>
  )
}

// ---- Register Form ----------------------------------------------------------
function CreateSeedLotForm({
  programList,
  germplasmList,
  onClose,
  onSaved,
}: {
  programList: Program[]
  germplasmList: Germplasm[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    program: programList[0]?.id?.toString() ?? '',
    germplasm: germplasmList[0]?.id?.toString() ?? '',
    quantity_grams: '100',
    seed_count: '',
    storage_location: 'Cold Room 1, Shelf A, Box 01',
    harvest_date: new Date().toISOString().split('T')[0],
    germination_rate: '',
    notes: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        program: Number(form.program),
        germplasm: Number(form.germplasm),
        quantity_grams: Number(form.quantity_grams),
        storage_location: form.storage_location,
        harvest_date: form.harvest_date || null,
        notes: form.notes,
      }
      if (form.seed_count) payload.seed_count = Number(form.seed_count)
      if (form.germination_rate) payload.germination_rate = Number(form.germination_rate)
      return seedLots.create(payload)
    },
    onSuccess: onSaved,
    onError: (err) => {
      if (err instanceof ApiError) setError(JSON.stringify(err.detail))
      else setError((err as Error).message)
    },
  })

  function set(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  return (
    <div>
      {error && <div className="alert alert-error mb-4"><span>⚠</span><span>{error}</span></div>}
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Program <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select className="form-input" value={form.program} onChange={e => set('program', e.target.value)} required>
            {programList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Germplasm Line <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <select className="form-input" value={form.germplasm} onChange={e => set('germplasm', e.target.value)} required>
            {germplasmList.map(g => <option key={g.id} value={g.id}>{g.name} ({g.germplasm_db_id})</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Quantity (grams) <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input className="form-input" type="number" step="0.1" value={form.quantity_grams} onChange={e => set('quantity_grams', e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">Est. Seed Count</label>
          <input className="form-input" type="number" placeholder="e.g. 2500" value={form.seed_count} onChange={e => set('seed_count', e.target.value)} />
        </div>

        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Storage Location <span style={{ color: 'var(--status-danger)' }}>*</span></label>
          <input className="form-input" placeholder="e.g. Cold Room 1, Rack B, Box 14" value={form.storage_location} onChange={e => set('storage_location', e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">Harvest Date</label>
          <input className="form-input" type="date" value={form.harvest_date} onChange={e => set('harvest_date', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Germination Rate (%)</label>
          <input className="form-input" type="number" step="0.1" placeholder="e.g. 95.5" value={form.germination_rate} onChange={e => set('germination_rate', e.target.value)} />
        </div>

        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Notes</label>
          <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button 
          className="btn btn-primary" 
          onClick={() => mutation.mutate()} 
          disabled={mutation.isPending || !form.program || !form.germplasm || !form.storage_location}
        >
          {mutation.isPending ? 'Registering…' : 'Save Seed Lot'}
        </button>
      </div>
    </div>
  )
}

// ---- Adjust Inventory Form --------------------------------------------------
function AdjustSeedForm({ lot, onClose, onSaved }: { lot: SeedLot; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'planting_deduction' | 'harvest_deposit' | 'distribution' | 'adjustment'>('planting_deduction')
  const [delta, setDelta] = useState('20')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const amt = Number(delta)
      const quantityGrams = type === 'planting_deduction' || type === 'distribution' ? -Math.abs(amt) : Math.abs(amt)
      return seedLots.adjust(lot.id, {
        transaction_type: type,
        quantity_grams: quantityGrams,
        notes,
      })
    },
    onSuccess: onSaved,
    onError: (err) => {
      if (err instanceof ApiError) setError(JSON.stringify(err.detail))
      else setError((err as Error).message)
    },
  })

  return (
    <div>
      {error && <div className="alert alert-error mb-4"><span>⚠</span><span>{error}</span></div>}

      <div className="card mb-4" style={{ padding: 'var(--space-3)', backgroundColor: 'var(--surface-base)' }}>
        <div className="flex justify-between items-center text-sm">
          <span>Current Balance:</span>
          <strong className="font-mono text-base">{lot.quantity_grams} g</strong>
        </div>
        <div className="flex justify-between items-center text-xs text-muted mt-1">
          <span>Location:</span>
          <span>{lot.storage_location}</span>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Transaction Type</label>
          <select className="form-input" value={type} onChange={e => setType(e.target.value as any)}>
            <option value="planting_deduction">🌱 Planting Deduction (Deduct)</option>
            <option value="distribution">📦 Distribution / Transfer (Deduct)</option>
            <option value="harvest_deposit">🌾 Harvest / Increase Deposit (Add)</option>
            <option value="adjustment">⚖️ Inventory Recount / Adjustment</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Quantity (grams)</label>
          <input className="form-input" type="number" step="0.1" value={delta} onChange={e => setDelta(e.target.value)} required />
        </div>

        <div className="form-group" style={{ gridColumn: '1/-1' }}>
          <label className="form-label">Notes / Reason</label>
          <input className="form-input" placeholder="e.g. Sowed in Nursery 2026 Block A" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
        <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !delta}>
          {mutation.isPending ? 'Logging…' : 'Record Transaction'}
        </button>
      </div>
    </div>
  )
}

// ---- Barcode Label Modal ----------------------------------------------------
function BarcodeLabelModalContent({ lot, onClose }: { lot: SeedLot; onClose: () => void }) {
  const { data: label, isLoading } = useQuery<BarcodeLabelData>({
    queryKey: ['seed-label', lot.id],
    queryFn: () => seedLots.getLabelData(lot.id),
  })

  return (
    <div>
      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Generating label payload…</div>
      ) : label ? (
        <div>
          {/* Printable Label Preview Card */}
          <div 
            id="printable-seed-sticker"
            style={{ 
              border: '2px dashed var(--brand-500)', 
              borderRadius: 'var(--radius-md)', 
              padding: 'var(--space-4)', 
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontFamily: 'system-ui, sans-serif',
              marginBottom: 'var(--space-4)',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: 6 }}>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{label.germplasm_name}</div>
                <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{label.species} · {label.program_name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>{label.quantity_grams} g</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Plot #{label.source_plot}</div>
              </div>
            </div>

            {/* Barcode Strip */}
            <div style={{ margin: '14px 0', textAlign: 'center' }}>
              <div 
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '1.8rem', 
                  letterSpacing: '5px',
                  fontWeight: 900,
                  color: '#000000',
                  borderTop: '2px solid #000',
                  borderBottom: '2px solid #000',
                  padding: '4px 0',
                  background: 'repeating-linear-gradient(90deg, #000 0px, #000 3px, #fff 3px, #fff 6px, #000 6px, #000 10px, #fff 10px, #fff 12px)'
                }}
              >
                <span style={{ backgroundColor: '#fff', padding: '0 8px' }}>{label.lot_code}</span>
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginTop: 2 }}>{label.lot_code}</div>
            </div>

            {/* Storage and scan info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#334155' }}>
              <div>
                <strong>Location:</strong> {label.storage_location}
              </div>
              <div>
                <strong>Harvested:</strong> {label.harvest_date}
              </div>
            </div>
          </div>

          <div className="text-xs text-muted mb-4">
            💡 Formatted for standard 2" × 3" seed packet adhesive labels. Use browser print preview to send to thermal or standard label printer.
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
            <button 
              className="btn btn-primary" 
              onClick={() => window.print()}
            >
              🖨️ Print Label Sticker
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

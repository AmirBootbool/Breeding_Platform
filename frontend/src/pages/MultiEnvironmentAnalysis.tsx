import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  programs,
  trials,
  observationVariables,
  analysisSets,
  Program,
  ObservationVariable,
  AnalysisSet,
  ApiError
} from '../api/client'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuthStore } from '../store/authStore'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

function ApiErrorMsg({ err }: { err: unknown }) {
  if (!err) return null
  const msg = err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message
  return <div className="alert alert-error mb-4"><span>⚠</span><span>{msg}</span></div>
}

export default function MultiEnvironmentAnalysis() {
  const queryClient = useQueryClient()
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [selectedSet, setSelectedSet] = useState<AnalysisSet | null>(null)
  const [selectedVariable, setSelectedVariable] = useState<ObservationVariable | null>(null)
  
  const [showCreate, setShowCreate] = useState(false)
  const [deleteItem, setDeleteItem] = useState<AnalysisSet | null>(null)

  // Pedigree grouping toggle
  const [groupByFamily, setGroupByFamily] = useState(false)

  // Queries
  const { data: setListRes, isLoading: setsLoading } = useQuery({
    queryKey: ['analysis-sets'],
    queryFn: () => analysisSets.list(),
  })
  const { data: varRes } = useQuery({
    queryKey: ['variables'],
    queryFn: () => observationVariables.list(),
  })

  // Queries for chosen set & trait stats
  const { data: heritabilityRes, isLoading: h2Loading, error: h2Error } = useQuery({
    queryKey: ['heritability', selectedSet?.id, selectedVariable?.id],
    queryFn: () => analysisSets.getHeritability(selectedSet!.id, selectedVariable!.id),
    enabled: !!selectedSet && !!selectedVariable,
  })

  const { data: rankingRes, isLoading: rankingLoading } = useQuery({
    queryKey: ['ranking', selectedSet?.id, selectedVariable?.id],
    queryFn: () => analysisSets.getRanking(selectedSet!.id, selectedVariable!.id),
    enabled: !!selectedSet && !!selectedVariable,
  })

  const deleteMut = useMutation({
    mutationFn: () => analysisSets.destroy(deleteItem!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-sets'] })
      if (selectedSet?.id === deleteItem?.id) {
        setSelectedSet(null)
        setSelectedVariable(null)
      }
      setDeleteItem(null)
    }
  })

  // Heritability band categorizer
  const getH2Band = (h2: number | null) => {
    if (h2 === null) return { text: 'N/A', class: 'badge-gray' }
    if (h2 < 0.3) return { text: 'Low Heritability', class: 'badge-danger' }
    if (h2 <= 0.6) return { text: 'Moderate Heritability', class: 'badge-amber' }
    return { text: 'High Heritability', class: 'badge-success' }
  }

  // Pre-process recharts data: grouping env_means per environment
  // We want structure: [ { name: "G1", env1: 10.2, env2: 9.8 }, ... ]
  const chartData = rankingRes?.map(entry => {
    const rawMeans = entry.raw_means_by_env || {}
    return {
      name: entry.germplasm,
      ...rawMeans
    }
  }) || []

  // Extract list of all environment keys represented across entries
  const allEnvironments = Array.from(
    new Set(rankingRes?.flatMap(entry => Object.keys(entry.raw_means_by_env || {})) || [])
  )

  // Pedigree sorting & grouping helper
  const processedRanking = rankingRes ? [...rankingRes] : []
  if (groupByFamily) {
    processedRanking.sort((a, b) => {
      const famA = a.family_group || ''
      const famB = b.family_group || ''
      if (famA !== famB) return famA.localeCompare(famB)
      return b.adjusted_mean - a.adjusted_mean
    })
  }

  const h2Band = heritabilityRes ? getH2Band(heritabilityRes.h2) : null

  return (
    <div className="page-shell">
      <TopBar
        title="Multi-Environment Analysis"
        subtitle="Estimate broad-sense heritability (H²) and perform environment-adjusted genotype rankings."
      />

      <div className="flex gap-6 items-start" style={{ flexWrap: 'wrap' }}>
        {/* Sidebar / Left Column */}
        <div style={{ width: 320, maxWidth: '100%', flexShrink: 0 }}>
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="card-title" style={{ margin: 0 }}>Analysis Sets</h3>
              {canWrite && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  + Create Set
                </button>
              )}
            </div>

            {setsLoading ? (
              <div className="loading-spinner"><div className="spinner" /></div>
            ) : (
              <div className="flex flex-col gap-2">
                {setListRes?.results.map(set => (
                  <div
                    key={set.id}
                    className="flex justify-between items-center p-3 rounded cursor-pointer border transition-colors"
                    style={{
                      borderColor: selectedSet?.id === set.id ? 'var(--brand-400)' : 'var(--border-subtle)',
                      background: selectedSet?.id === set.id ? 'hsla(var(--hue-brand), 52%, 40%, 0.15)' : 'var(--bg-elevated)',
                      borderRadius: 'var(--r-md)',
                    }}
                    onClick={() => {
                      setSelectedSet(set)
                      setSelectedVariable(null)
                    }}
                  >
                    <div>
                      <div className="font-bold text-sm">{set.name}</div>
                      <div className="text-xs text-muted mt-1">
                        {set.trial_details.length} trials • {set.program_name}
                      </div>
                    </div>
                    {canWrite && (
                      <button
                        className="btn btn-ghost btn-sm text-danger"
                        style={{ color: 'var(--status-danger)', padding: 'var(--space-1)' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteItem(set)
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                ))}
                {(!setListRes || setListRes.results.length === 0) && (
                  <div className="text-center text-muted p-4 text-sm">No analysis sets found.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1" style={{ minWidth: 320 }}>
          {!selectedSet ? (
            <div className="card text-center p-12 text-muted">
              Select or create an analysis set in the left panel to begin.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Set details & Trait selection */}
              <div className="card">
                <div className="flex justify-between items-start mb-4" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                  <div>
                    <h2 className="text-xl font-bold mb-1">{selectedSet.name}</h2>
                    <p className="text-sm text-muted mb-2">{selectedSet.description || 'No description provided.'}</p>
                    <div className="flex gap-2">
                      <span className="badge badge-gray">Program: {selectedSet.program_name}</span>
                      <span className="badge badge-gray">{selectedSet.trial_details.length} Trials</span>
                    </div>
                  </div>
                  <div>
                    <div className="form-group" style={{ minWidth: 240 }}>
                      <label className="form-label">Trait / Variable</label>
                      <select
                        className="form-input"
                        value={selectedVariable?.id || ''}
                        onChange={(e) => {
                          const v = varRes?.results.find(item => item.id === parseInt(e.target.value))
                          setSelectedVariable(v || null)
                        }}
                      >
                        <option value="">-- Choose Trait --</option>
                        {varRes?.results.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.variable_code || v.name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="divider" />
                <div>
                  <h4 className="card-title">Trials Included in MET:</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedSet.trial_details.map(t => (
                      <div key={t.id} className="badge badge-gray flex items-center gap-1" style={{ padding: '4px 8px' }}>
                        <span>🧪 <strong>{t.trial_code}</strong></span>
                        <span className="text-xs text-muted">({t.location_name} • {t.season_name})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {selectedVariable && (
                <>
                  {/* Heritability statistics block */}
                  <div className="grid-3" style={{ gap: 'var(--space-6)' }}>
                    <div className="card flex flex-col justify-between">
                      <div>
                        <div className="card-title">Broad-Sense Heritability (H²)</div>
                        {h2Loading ? (
                          <div className="loading-spinner"><div className="spinner" /></div>
                        ) : heritabilityRes?.h2 !== null && heritabilityRes?.h2 !== undefined ? (
                          <div>
                            <div className="stat-value mb-2" style={{ color: 'var(--brand-300)' }}>
                              {heritabilityRes.h2.toFixed(3)}
                            </div>
                            {h2Band && (
                              <span className={`badge ${h2Band.class}`}>
                                {h2Band.text}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="stat-value text-muted">N/A</div>
                        )}
                      </div>
                      <div className="text-xs text-muted divider pt-2 mt-4">
                        H² measures phenotypic variance ratio explained by genotype across environments.
                      </div>
                    </div>

                    <div className="card" style={{ gridColumn: 'span 2' }}>
                      <h3 className="card-title">Variance Components</h3>
                      {h2Loading ? (
                        <div className="loading-spinner"><div className="spinner" /></div>
                      ) : heritabilityRes ? (
                        <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                          <div>
                            <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                              <span className="text-sm text-muted">Genotype Variance (Vg)</span>
                              <span className="font-mono">{heritabilityRes.variance_genotype ?? '—'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                              <span className="text-sm text-muted">GxE Variance (Vgxe)</span>
                              <span className="font-mono">{heritabilityRes.variance_gxe ?? '—'}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-sm text-muted">Residual Variance (Ve)</span>
                              <span className="font-mono">{heritabilityRes.variance_residual ?? '—'}</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                              <span className="text-sm text-muted">Environments</span>
                              <span className="font-bold">{heritabilityRes.n_environments}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-sm text-muted">Genotypes Evaluated</span>
                              <span className="font-bold">{heritabilityRes.n_genotypes}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-muted">No analysis results loaded.</div>
                      )}
                    </div>
                  </div>

                  {/* Warn if single environment or model errors */}
                  <ApiErrorMsg err={h2Error} />
                  {heritabilityRes?.warning && (
                    <div className="alert alert-warning mb-4">
                      <span>⚠</span>
                      <span>{heritabilityRes.warning}</span>
                    </div>
                  )}

                  {/* Visualizer and Ranking blocks */}
                  {rankingLoading ? (
                    <div className="card text-center p-12"><div className="loading-spinner"><div className="spinner" /></div></div>
                  ) : (
                    <>
                      {/* Grouped Bar Chart */}
                      {chartData.length > 0 && allEnvironments.length > 0 && (
                        <div className="card">
                          <h3 className="font-bold mb-4">GxE Crossover Visualizer (Raw Means by Environment)</h3>
                          <div style={{ width: '100%', height: 350 }}>
                            <ResponsiveContainer>
                              <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                {allEnvironments.map((env, idx) => (
                                  <Bar
                                    key={env}
                                    dataKey={env}
                                    name={`Env: ${env}`}
                                    fill={['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5]}
                                  />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Ranking Table */}
                      <div className="card">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-bold">Line Performance Ranking</h3>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={groupByFamily}
                              onChange={(e) => setGroupByFamily(e.target.checked)}
                            />
                            Group by family (pedigree string/sibs)
                          </label>
                        </div>

                        <div className="table-container">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th style={{ width: 60 }}>Rank</th>
                                <th>Germplasm</th>
                                <th>Family Group</th>
                                <th>Adjusted Mean (BLUE/BLUP)</th>
                                <th>Raw Mean</th>
                                <th>Observations</th>
                                <th>Environments</th>
                              </tr>
                            </thead>
                            <tbody>
                              {processedRanking.map((row, index) => {
                                const lowConfidence = row.n_environments === 1
                                return (
                                  <tr
                                    key={row.germplasm}
                                    style={{
                                      borderLeft: groupByFamily && row.family_group
                                        ? `4px solid ${['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][
                                            row.family_group.charCodeAt(0) % 5
                                          ]}`
                                        : undefined,
                                      opacity: lowConfidence ? 0.6 : 1
                                    }}
                                  >
                                    <td className="font-bold text-center">{index + 1}</td>
                                    <td>
                                      <strong>{row.germplasm}</strong>
                                      {lowConfidence && <span className="badge badge-gray text-xs ml-2">low confidence</span>}
                                    </td>
                                    <td>
                                      <span className="text-sm font-mono text-muted">
                                        {row.family_group || '—'}
                                      </span>
                                    </td>
                                    <td className="font-bold text-sm font-mono">{row.adjusted_mean.toFixed(3)}</td>
                                    <td className="text-sm font-mono text-muted">{row.raw_mean.toFixed(3)}</td>
                                    <td>{row.n_observations}</td>
                                    <td>{row.n_environments}</td>
                                  </tr>
                                )
                              })}
                              {processedRanking.length === 0 && (
                                <tr>
                                  <td colSpan={7} className="text-center text-muted">No ranking data returned.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <Modal title="Create Analysis Set" onClose={() => setShowCreate(false)}>
          <CreateSetForm onClose={() => setShowCreate(false)} />
        </Modal>
      )}

      {deleteItem && (
        <ConfirmDialog
          message={`Are you sure you want to delete the analysis set "${deleteItem.name}"?`}
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setDeleteItem(null)}
        />
      )}
    </div>
  )
}

function CreateSetForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [selectedTrials, setSelectedTrials] = useState<number[]>([])

  const { data: progRes } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })

  const { data: trialsRes } = useQuery({
    queryKey: ['trials', selectedProgram?.id],
    queryFn: () => trials.list(selectedProgram ? `&program=${selectedProgram.id}` : ''),
    enabled: !!selectedProgram,
  })

  const createMut = useMutation({
    mutationFn: (data: Partial<AnalysisSet>) => analysisSets.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-sets'] })
      onClose()
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !selectedProgram || selectedTrials.length === 0) return
    createMut.mutate({
      name,
      description,
      program: selectedProgram.id,
      trials: selectedTrials
    })
  }

  const toggleTrial = (id: number) => {
    setSelectedTrials(prev =>
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="form-group">
        <label className="form-label">Set Name</label>
        <input
          type="text"
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. 2024-2026 Yield trials"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea
          className="form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes or parameters..."
          rows={3}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Program</label>
        <select
          className="form-select"
          required
          value={selectedProgram?.id || ''}
          onChange={(e) => {
            const prog = progRes?.results.find(p => p.id === parseInt(e.target.value))
            setSelectedProgram(prog || null)
            setSelectedTrials([])
          }}
        >
          <option value="">-- Select Program --</option>
          {progRes?.results.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {selectedProgram && (
        <div className="form-group">
          <label className="form-label">Select Trials to Analyze (grouped by Season/Location)</label>
          <div
            className="border rounded p-3 flex flex-col gap-2 overflow-y-auto"
            style={{ maxHeight: 240 }}
          >
            {trialsRes?.results.map(trial => (
              <label key={trial.id} className="flex items-center gap-3 cursor-pointer p-1 hover:bg-gray-light rounded">
                <input
                  type="checkbox"
                  checked={selectedTrials.includes(trial.id)}
                  onChange={() => toggleTrial(trial.id)}
                />
                <div>
                  <strong>{trial.trial_code}</strong> — {trial.name}
                  <div className="text-xs text-muted">
                    📍 {trial.location_name} • 🌤 {trial.season_name}
                  </div>
                </div>
              </label>
            ))}
            {(!trialsRes || trialsRes.results.length === 0) && (
              <div className="text-center text-muted p-4">No trials found for this program.</div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-4 mt-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!name || !selectedProgram || selectedTrials.length === 0 || createMut.isPending}
        >
          {createMut.isPending ? 'Saving...' : 'Create Set'}
        </button>
      </div>
    </form>
  )
}

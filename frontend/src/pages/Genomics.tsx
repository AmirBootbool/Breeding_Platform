import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  programs,
  trials,
  observationVariables,
  analysisSets,
  genomics,
  GenotypeDataset,
  GenomicPrediction,
  ApiError,
} from '../api/client'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import { useAuthStore } from '../store/authStore'
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import './Genomics.css'

function ApiErrorMsg({ err }: { err: unknown }) {
  if (!err) return null
  const msg =
    err instanceof ApiError
      ? typeof err.detail === 'string'
        ? err.detail
        : JSON.stringify(err.detail)
      : (err as Error).message
  return (
    <div className="alert alert-error mb-4">
      <span>⚠</span>
      <span>{msg}</span>
    </div>
  )
}

export default function Genomics() {
  const queryClient = useQueryClient()
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  // Sub-tabs: 'prediction' | 'datasets' | 'mas'
  const [activeTab, setActiveTab] = useState<'prediction' | 'datasets' | 'mas'>('prediction')

  // Global filters
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)

  // 1. Prediction State
  const [selectedPrediction, setSelectedPrediction] = useState<GenomicPrediction | null>(null)
  const [showTrainModal, setShowTrainModal] = useState(false)
  const [gebvFilter, setGebvFilter] = useState<'all' | 'candidates' | 'training'>('all')
  const [gebvSearch, setGebvSearch] = useState('')

  // Train model form state
  const [modelName, setModelName] = useState('')
  const [trainProgram, setTrainProgram] = useState<number | ''>('')
  const [trainTrait, setTrainTrait] = useState<number | ''>('')
  const [trainDataset, setTrainDataset] = useState<number | ''>('')
  const [trainSourceType, setTrainSourceType] = useState<'trial' | 'analysis_set'>('trial')
  const [trainTrial, setTrainTrial] = useState<number | ''>('')
  const [trainAnalysisSet, setTrainAnalysisSet] = useState<number | ''>('')
  const [heritabilityPrior, setHeritabilityPrior] = useState<number>(0.5)
  const [kFolds, setKFolds] = useState<number>(5)

  // 2. Datasets State
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedDataset, setSelectedDataset] = useState<GenotypeDataset | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadProgram, setUploadProgram] = useState<number | ''>('')
  const [uploadFormat, setUploadFormat] = useState<'matrix' | 'vcf' | 'hapmap'>('matrix')
  const [uploadMaf, setUploadMaf] = useState<number>(0.05)
  const [uploadImputation, setUploadImputation] = useState<string>('mean')

  // 3. MAS State
  const [showAddMarkerModal, setShowAddMarkerModal] = useState(false)
  const [markerName, setMarkerName] = useState('')
  const [markerGene, setMarkerGene] = useState('')
  const [markerChr, setMarkerChr] = useState('')
  const [markerTrait, setMarkerTrait] = useState('')
  const [markerCategory, setMarkerCategory] = useState<
    'disease' | 'agronomic' | 'quality' | 'phenology' | 'abiotic'
  >('disease')
  const [markerFavAllele, setMarkerFavAllele] = useState('')
  const [markerUnfavAllele, setMarkerUnfavAllele] = useState('')
  const [markerAssay, setMarkerAssay] = useState<'KASP' | 'TaqMan' | 'PCR_Gel' | 'SNP_Chip'>('KASP')
  const [markerEffect, setMarkerEffect] = useState('')
  const [editScoreModal, setEditScoreModal] = useState<{
    lineName: string
    germplasmId: number
    markerId: number
    markerName: string
    currentStatus: string
    rawGt: string
  } | null>(null)

  // ============================================================================
  // React Queries
  // ============================================================================

  const { data: programRes } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })
  const programList = programRes?.results ?? []

  const { data: traitRes } = useQuery({
    queryKey: ['observation-variables'],
    queryFn: () => observationVariables.list(''),
  })
  const traitList = traitRes?.results ?? []

  const { data: trialRes } = useQuery({
    queryKey: ['trials', selectedProgramId],
    queryFn: () => trials.list(selectedProgramId ? `&program=${selectedProgramId}` : ''),
  })
  const trialList = trialRes?.results ?? []

  const { data: analysisSetRes } = useQuery({
    queryKey: ['analysis-sets', selectedProgramId],
    queryFn: () => analysisSets.list(selectedProgramId ? `&program=${selectedProgramId}` : ''),
  })
  const analysisSetList = analysisSetRes?.results ?? []

  // Predictions query
  const {
    data: predictionListRes,
    isLoading: predictionsLoading,
    error: predictionError,
  } = useQuery({
    queryKey: ['genomic-predictions', selectedProgramId],
    queryFn: () =>
      genomics.predictions.list(selectedProgramId ? `&program=${selectedProgramId}` : ''),
  })
  const predictions = predictionListRes?.results ?? []

  // Active prediction GEBVs
  const activePredId = selectedPrediction?.id ?? (predictions.length > 0 ? predictions[0].id : null)
  const currentPred = selectedPrediction ?? (predictions.length > 0 ? predictions[0] : null)

  const { data: gebvRes, isLoading: gebvsLoading } = useQuery({
    queryKey: ['gebvs', activePredId, gebvFilter, gebvSearch],
    queryFn: () => {
      if (!activePredId) return null
      let q = ''
      if (gebvFilter === 'candidates') q += '&is_training=false'
      if (gebvFilter === 'training') q += '&is_training=true'
      if (gebvSearch) q += `&search=${encodeURIComponent(gebvSearch)}`
      return genomics.predictions.gebvs(activePredId, q)
    },
    enabled: !!activePredId,
  })
  const gebvList = gebvRes?.results ?? []

  // Datasets query
  const {
    data: datasetListRes,
    isLoading: datasetsLoading,
    error: datasetError,
  } = useQuery({
    queryKey: ['genotype-datasets', selectedProgramId],
    queryFn: () =>
      genomics.datasets.list(selectedProgramId ? `&program=${selectedProgramId}` : ''),
  })
  const datasets = datasetListRes?.results ?? []
  const activeDataset = selectedDataset ?? (datasets.length > 0 ? datasets[0] : null)

  // Kinship Matrix query for active dataset
  const { data: grmRes, isLoading: grmLoading } = useQuery({
    queryKey: ['grm-matrix', activeDataset?.id],
    queryFn: () => (activeDataset ? genomics.datasets.grmMatrix(activeDataset.id) : null),
    enabled: !!activeDataset && activeTab === 'datasets',
  })

  // MAS Markers & Stacking query
  const { data: markersRes } = useQuery({
    queryKey: ['diagnostic-markers'],
    queryFn: () => genomics.markers.list(),
  })
  const markerList = markersRes?.results ?? []

  const {
    data: masStackingRes,
    isLoading: masLoading,
    error: masError,
  } = useQuery({
    queryKey: ['mas-stacking', selectedProgramId],
    queryFn: () => genomics.scores.stackingOverview(selectedProgramId || undefined),
    enabled: activeTab === 'mas',
  })

  // ============================================================================
  // Mutations
  // ============================================================================

  const trainModelMutation = useMutation({
    mutationFn: genomics.predictions.run,
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['genomic-predictions'] })
      setShowTrainModal(false)
      setSelectedPrediction(data.prediction)
      setModelName('')
    },
  })

  const uploadDatasetMutation = useMutation({
    mutationFn: genomics.datasets.upload,
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['genotype-datasets'] })
      setShowUploadModal(false)
      setSelectedDataset(data.dataset)
      setUploadFile(null)
      setUploadName('')
    },
  })

  const seedMarkersMutation = useMutation({
    mutationFn: (progId?: number) => genomics.markers.seedDefaults(progId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-markers'] })
      queryClient.invalidateQueries({ queryKey: ['mas-stacking'] })
    },
  })

  const createMarkerMutation = useMutation({
    mutationFn: genomics.markers.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnostic-markers'] })
      queryClient.invalidateQueries({ queryKey: ['mas-stacking'] })
      setShowAddMarkerModal(false)
    },
  })

  const updateScoreMutation = useMutation({
    mutationFn: genomics.scores.batchScore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mas-stacking'] })
      setEditScoreModal(null)
    },
  })

  // Handle train form submission
  function handleTrainSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modelName || !trainProgram || !trainTrait || !trainDataset) return
    trainModelMutation.mutate({
      name: modelName,
      program: Number(trainProgram),
      trait: Number(trainTrait),
      genotype_dataset: Number(trainDataset),
      training_trial: trainSourceType === 'trial' ? Number(trainTrial) || null : null,
      training_analysis_set:
        trainSourceType === 'analysis_set' ? Number(trainAnalysisSet) || null : null,
      heritability_prior: heritabilityPrior,
      k_folds: kFolds,
    })
  }

  // Handle dataset upload submission
  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile || !uploadProgram) return
    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('name', uploadName || uploadFile.name.replace(/\.[^/.]+$/, ''))
    formData.append('program', String(uploadProgram))
    formData.append('file_format', uploadFormat)
    formData.append('maf_threshold', String(uploadMaf))
    formData.append('imputation_method', uploadImputation)

    uploadDatasetMutation.mutate(formData)
  }

  // Handle custom marker submit
  function handleCreateMarkerSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!markerName || !markerTrait || !markerFavAllele) return
    createMarkerMutation.mutate({
      name: markerName,
      gene_symbol: markerGene,
      chromosome: markerChr,
      target_trait: markerTrait,
      trait_category: markerCategory,
      favorable_allele: markerFavAllele,
      unfavorable_allele: markerUnfavAllele,
      assay_type: markerAssay,
      effect_description: markerEffect,
      program: selectedProgramId || null,
    })
  }

  // Handle single score update
  function handleScoreSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editScoreModal) return
    updateScoreMutation.mutate([
      {
        marker_id: editScoreModal.markerId,
        germplasm_id: editScoreModal.germplasmId,
        call_status: editScoreModal.currentStatus as any,
        raw_genotype: editScoreModal.rawGt,
      },
    ])
  }

  return (
    <div className="genomics-page">
      <TopBar
        title="Genomics & Marker-Assisted Selection"
        subtitle="Genomic BLUP breeding values (GEBVs), VanRaden relationship matrix, and diagnostic MAS trait stacking"
        actions={
          <div className="flex items-center gap-2">
            <select
              className="select select-sm bg-base-100"
              value={selectedProgramId ?? ''}
              onChange={e =>
                setSelectedProgramId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">All Programs</option>
              {programList.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.crop})
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Navigation Tabs */}
      <div className="genomics-tabs-bar">
        <button
          className={`tab-btn ${activeTab === 'prediction' ? 'active' : ''}`}
          onClick={() => setActiveTab('prediction')}
        >
          🎯 Genomic Prediction & GEBVs
        </button>
        <button
          className={`tab-btn ${activeTab === 'datasets' ? 'active' : ''}`}
          onClick={() => setActiveTab('datasets')}
        >
          🧬 Genotype Datasets & Kinship ($G$-Matrix)
        </button>
        <button
          className={`tab-btn ${activeTab === 'mas' ? 'active' : ''}`}
          onClick={() => setActiveTab('mas')}
        >
          🛡️ Marker-Assisted Selection (MAS)
        </button>
      </div>

      <div className="genomics-content">
        {/* ======================================================================== */}
        {/* TAB 1: GENOMIC PREDICTION (GBLUP & GEBVs)                                */}
        {/* ======================================================================== */}
        {activeTab === 'prediction' && (
          <div className="prediction-tab">
            <ApiErrorMsg err={predictionError || trainModelMutation.error} />

            {/* Top Action Bar */}
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Active Prediction Session:</span>
                <select
                  className="select select-sm bg-base-100 min-w-[260px]"
                  value={currentPred?.id ?? ''}
                  onChange={e => {
                    const found = predictions.find(p => p.id === Number(e.target.value))
                    if (found) setSelectedPrediction(found)
                  }}
                  disabled={predictionsLoading || predictions.length === 0}
                >
                  {predictions.length === 0 && <option value="">No prediction models yet</option>}
                  {predictions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.trait_name}] (r={p.cv_accuracy?.toFixed(2) ?? 'N/A'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                {currentPred && (
                  <a
                    href={genomics.predictions.exportCsvUrl(currentPred.id)}
                    className="btn btn-sm btn-outline"
                    download
                    title="Download GEBVs as CSV"
                  >
                    ⬇ Export GEBVs CSV
                  </a>
                )}
                {canWrite && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      if (selectedProgramId) setTrainProgram(selectedProgramId)
                      setShowTrainModal(true)
                    }}
                  >
                    + Train New Prediction Model
                  </button>
                )}
              </div>
            </div>

            {/* Main Prediction Display */}
            {currentPred ? (
              <div className="space-y-6">
                {/* KPI Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="stat-card">
                    <div className="stat-label">Cross-Validation Accuracy</div>
                    <div
                      className={`stat-value ${
                        (currentPred.cv_accuracy ?? 0) >= 0.5
                          ? 'text-success'
                          : (currentPred.cv_accuracy ?? 0) >= 0.3
                          ? 'text-warning'
                          : 'text-error'
                      }`}
                    >
                      {currentPred.cv_accuracy !== null
                        ? `r = ${currentPred.cv_accuracy.toFixed(3)}`
                        : 'N/A'}
                    </div>
                    <div className="stat-desc">5-fold CV Pearson Correlation</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">SNP Heritability (h²_SNP)</div>
                    <div className="stat-value text-primary">
                      {currentPred.genomic_heritability !== null
                        ? currentPred.genomic_heritability.toFixed(3)
                        : 'N/A'}
                    </div>
                    <div className="stat-desc">Genomic variance proportion</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Candidate Lines (Unphenotyped)</div>
                    <div className="stat-value text-accent">{currentPred.n_candidates}</div>
                    <div className="stat-desc">Predicted without field trials</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Training Set Size</div>
                    <div className="stat-value text-secondary">{currentPred.n_training}</div>
                    <div className="stat-desc">
                      From {currentPred.training_trial_name || currentPred.training_analysis_set_name || 'Trial'}
                    </div>
                  </div>
                </div>

                {/* Visualizations Row: Scatter Plot & GEBV Distribution */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Scatter: Observed vs Predicted */}
                  <div className="card bg-base-100 p-4">
                    <h3 className="text-base font-semibold mb-2">
                      🎯 Training Fit: Observed Phenotypic BLUE vs Predicted GEBV
                    </h3>
                    <p className="text-xs text-muted mb-4">
                      Assesses how well genomic relationship matrix captures phenotypic variance in training lines.
                    </p>
                    <div className="h-64">
                      {gebvList.filter(g => g.is_training && g.observed_phenotype !== null).length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis
                              type="number"
                              dataKey="observed_phenotype"
                              name="Observed Mean"
                              unit={` ${currentPred.trait_unit || ''}`}
                            />
                            <YAxis
                              type="number"
                              dataKey="gebv"
                              name="Predicted GEBV"
                              unit={` ${currentPred.trait_unit || ''}`}
                            />
                            <Tooltip
                              cursor={{ strokeDasharray: '3 3' }}
                              content={({ payload }) => {
                                if (!payload || !payload.length) return null
                                const d = payload[0].payload
                                return (
                                  <div className="custom-tooltip p-2 bg-base-200 rounded text-xs shadow-md">
                                    <div className="font-bold">{d.germplasm_name}</div>
                                    <div>Observed: {d.observed_phenotype}</div>
                                    <div>GEBV: {d.gebv}</div>
                                    <div>Reliability: {(d.reliability * 100).toFixed(1)}%</div>
                                  </div>
                                )
                              }}
                            />
                            <Scatter
                              name="Training Lines"
                              data={gebvList.filter(
                                g => g.is_training && g.observed_phenotype !== null
                              )}
                              fill="#10b981"
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted text-sm">
                          No observed training data points available for scatter plot.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Distribution: Candidate GEBVs */}
                  <div className="card bg-base-100 p-4">
                    <h3 className="text-base font-semibold mb-2">
                      📊 GEBV Performance Distribution (Top Ranked Lines)
                    </h3>
                    <p className="text-xs text-muted mb-4">
                      Displays top predicted lines with color-coded training vs unphenotyped candidate designation.
                    </p>
                    <div className="h-64">
                      {gebvList.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={gebvList.slice(0, 15)}
                            margin={{ top: 10, right: 10, bottom: 30, left: 10 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis dataKey="germplasm_name" angle={-35} textAnchor="end" interval={0} height={40} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="gebv" name="GEBV">
                              {gebvList.slice(0, 15).map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.is_training ? '#3b82f6' : '#10b981'}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted text-sm">
                          No ranking entries found.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* GEBV Line Rankings Table */}
                <div className="card bg-base-100 p-4">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                    <div>
                      <h3 className="text-lg font-bold">Line Rankings by GEBV</h3>
                      <p className="text-xs text-muted">
                        Sorted by genomic breeding value. High reliability lines make ideal advancement or crossing candidates.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Filter Pills */}
                      <div className="join">
                        <button
                          className={`join-item btn btn-xs ${gebvFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setGebvFilter('all')}
                        >
                          All ({gebvRes?.count ?? 0})
                        </button>
                        <button
                          className={`join-item btn btn-xs ${gebvFilter === 'candidates' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setGebvFilter('candidates')}
                        >
                          Candidates Only ({currentPred.n_candidates})
                        </button>
                        <button
                          className={`join-item btn btn-xs ${gebvFilter === 'training' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setGebvFilter('training')}
                        >
                          Training Set ({currentPred.n_training})
                        </button>
                      </div>

                      <input
                        type="text"
                        placeholder="Search line name or ID..."
                        className="input input-sm input-bordered w-48"
                        value={gebvSearch}
                        onChange={e => setGebvSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="table table-sm w-full">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Germplasm Line</th>
                          <th>DB ID</th>
                          <th>Type</th>
                          <th>Predicted GEBV</th>
                          <th>Reliability (r²)</th>
                          <th>Std Error</th>
                          <th>Observed Phenotype</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gebvsLoading && (
                          <tr>
                            <td colSpan={8} className="text-center py-6">
                              Loading GEBVs...
                            </td>
                          </tr>
                        )}
                        {!gebvsLoading && gebvList.length === 0 && (
                          <tr>
                            <td colSpan={8} className="text-center py-6 text-muted">
                              No matching lines found.
                            </td>
                          </tr>
                        )}
                        {gebvList.map(item => (
                          <tr key={item.id} className="hover">
                            <td className="font-bold">#{item.rank}</td>
                            <td className="font-medium text-primary">{item.germplasm_name}</td>
                            <td className="text-xs text-muted">{item.germplasm_db_id || item.sample_id}</td>
                            <td>
                              {item.is_training ? (
                                <span className="badge badge-sm badge-info">Training</span>
                              ) : (
                                <span className="badge badge-sm badge-success">Candidate (Unphenotyped)</span>
                              )}
                            </td>
                            <td className="font-bold text-success">
                              {item.gebv >= 0 ? `+${item.gebv.toFixed(3)}` : item.gebv.toFixed(3)}{' '}
                              <span className="text-xs text-muted font-normal">{currentPred.trait_unit}</span>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <progress
                                  className="progress progress-primary w-16"
                                  value={item.reliability * 100}
                                  max="100"
                                />
                                <span className="text-xs font-mono">
                                  {(item.reliability * 100).toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="text-xs text-muted">
                              {item.standard_error ? `±${item.standard_error.toFixed(3)}` : '—'}
                            </td>
                            <td className="text-xs font-mono">
                              {item.observed_phenotype !== null
                                ? `${item.observed_phenotype.toFixed(3)} ${currentPred.trait_unit || ''}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card bg-base-100 p-8 text-center">
                <div className="text-4xl mb-2">🎯</div>
                <h3 className="text-lg font-bold mb-1">No Genomic Prediction Models Trained</h3>
                <p className="text-muted text-sm max-w-md mx-auto mb-4">
                  Train a GBLUP model using your genotyped lines and field trial data to predict Genomic Estimated
                  Breeding Values (GEBVs) for unphenotyped selection candidates.
                </p>
                {canWrite && (
                  <div>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (selectedProgramId) setTrainProgram(selectedProgramId)
                        setShowTrainModal(true)
                      }}
                    >
                      + Train First Genomic Prediction Model
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ======================================================================== */}
        {/* TAB 2: GENOTYPE DATASETS & KINSHIP MATRIX                                */}
        {/* ======================================================================== */}
        {activeTab === 'datasets' && (
          <div className="datasets-tab space-y-6">
            <ApiErrorMsg err={datasetError || uploadDatasetMutation.error} />

            {/* Top Toolbar */}
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Select Dataset:</span>
                <select
                  className="select select-sm bg-base-100 min-w-[240px]"
                  value={activeDataset?.id ?? ''}
                  onChange={e => {
                    const found = datasets.find(d => d.id === Number(e.target.value))
                    if (found) setSelectedDataset(found)
                  }}
                  disabled={datasetsLoading || datasets.length === 0}
                >
                  {datasets.length === 0 && <option value="">No datasets uploaded</option>}
                  {datasets.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.sample_count} samples, {d.marker_count} SNPs)
                    </option>
                  ))}
                </select>
              </div>

              {canWrite && (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    if (selectedProgramId) setUploadProgram(selectedProgramId)
                    setShowUploadModal(true)
                  }}
                >
                  + Upload Genotype File (VCF / HapMap / Matrix)
                </button>
              )}
            </div>

            {activeDataset ? (
              <div className="space-y-6">
                {/* Dataset Metadata Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="stat-card">
                    <div className="stat-label">Genotyped Lines</div>
                    <div className="stat-value text-primary">{activeDataset.sample_count}</div>
                    <div className="stat-desc">{activeDataset.species}</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">SNP Marker Density</div>
                    <div className="stat-value text-accent">{activeDataset.marker_count}</div>
                    <div className="stat-desc">Filtered markers</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">MAF Threshold</div>
                    <div className="stat-value text-secondary">
                      {(activeDataset.maf_threshold * 100).toFixed(0)}%
                    </div>
                    <div className="stat-desc">Minor Allele Frequency</div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">Format & Imputation</div>
                    <div className="stat-value text-sm uppercase font-bold">{activeDataset.file_format}</div>
                    <div className="stat-desc">Imputation: {activeDataset.imputation_method}</div>
                  </div>
                </div>

                {/* Kinship Matrix Visualizations */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* PCA Genetic Diversity Scatter */}
                  <div className="card bg-base-100 p-4">
                    <h3 className="text-base font-semibold mb-2">
                      🧬 Principal Component Analysis (PCA Kinship Clustering)
                    </h3>
                    <p className="text-xs text-muted mb-4">
                      PC1 vs PC2 coordinates derived from the VanRaden Genomic Relationship Matrix.
                    </p>
                    <div className="h-64">
                      {grmRes?.pca_coordinates && grmRes.pca_coordinates.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis type="number" dataKey="pc1" name="PC1" />
                            <YAxis type="number" dataKey="pc2" name="PC2" />
                            <Tooltip
                              cursor={{ strokeDasharray: '3 3' }}
                              content={({ payload }) => {
                                if (!payload || !payload.length) return null
                                const d = payload[0].payload
                                return (
                                  <div className="custom-tooltip p-2 bg-base-200 rounded text-xs shadow-md">
                                    <div className="font-bold">{d.sample_id}</div>
                                    <div>PC1: {d.pc1}</div>
                                    <div>PC2: {d.pc2}</div>
                                  </div>
                                )
                              }}
                            />
                            <Scatter name="Genotypes" data={grmRes.pca_coordinates} fill="#8b5cf6" />
                          </ScatterChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted text-sm">
                          {grmLoading ? 'Computing G-Matrix PCA...' : 'No PCA coordinates available.'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Heatmap preview */}
                  <div className="card bg-base-100 p-4">
                    <h3 className="text-base font-semibold mb-2">
                      🔥 VanRaden Genomic Relationship Matrix Heatmap
                    </h3>
                    <p className="text-xs text-muted mb-4">
                      Pairwise kinship coefficients G_ij (diagonal ~ 1.0, unrelated lines ~ 0.0).
                    </p>
                    {grmRes?.heatmap ? (
                      <div className="overflow-auto max-h-64 p-2 bg-base-200 rounded">
                        <div
                          className="grid gap-[2px]"
                          style={{
                            gridTemplateColumns: `repeat(${grmRes.heatmap.samples.length}, minmax(14px, 1fr))`,
                          }}
                        >
                          {grmRes.heatmap.matrix.map((row, i) =>
                            row.map((val, j) => {
                              const intensity = Math.min(1.0, Math.max(0.0, val / 1.5))
                              const bg = `rgba(139, 92, 246, ${intensity})`
                              return (
                                <div
                                  key={`${i}-${j}`}
                                  className="w-full aspect-square rounded-[2px] cursor-pointer hover:border border-white"
                                  style={{ backgroundColor: bg }}
                                  title={`${grmRes.heatmap.samples[i]} x ${grmRes.heatmap.samples[j]}: G=${val.toFixed(2)}`}
                                />
                              )
                            })
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-64 items-center justify-center text-muted text-sm">
                        {grmLoading ? 'Generating Relationship Heatmap...' : 'No matrix data.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card bg-base-100 p-8 text-center">
                <div className="text-4xl mb-2">🧬</div>
                <h3 className="text-lg font-bold mb-1">No Genotype Datasets Found</h3>
                <p className="text-muted text-sm max-w-md mx-auto mb-4">
                  Upload a standard VCF variant call file, HapMap (.hmp.txt), or numeric dosage CSV matrix to start
                  genomic kinship and breeding value calculations.
                </p>
                {canWrite && (
                  <div>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (selectedProgramId) setUploadProgram(selectedProgramId)
                        setShowUploadModal(true)
                      }}
                    >
                      + Upload Genotype Dataset
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ======================================================================== */}
        {/* TAB 3: MARKER-ASSISTED SELECTION (MAS & TRAIT STACKING)                 */}
        {/* ======================================================================== */}
        {activeTab === 'mas' && (
          <div className="mas-tab space-y-6">
            <ApiErrorMsg err={masError || seedMarkersMutation.error} />

            {/* Top Toolbar */}
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold">Wheat Diagnostic Marker Library & Stacking</h2>
                <p className="text-xs text-muted">
                  Screen elite accessions against major functional genes (Lr34, Fhb1, Rht-B1, Ppd-D1, Gpc-B1) and
                  calculate favorable allele accumulation.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {canWrite && (
                  <>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => seedMarkersMutation.mutate(selectedProgramId || undefined)}
                      disabled={seedMarkersMutation.isPending}
                      title="Auto-load standard wheat functional markers"
                    >
                      {seedMarkersMutation.isPending ? 'Seeding...' : '🌱 Seed Default Wheat Markers'}
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => setShowAddMarkerModal(true)}
                    >
                      + Add Functional Marker
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Diagnostic Markers Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {markerList.map(m => (
                <div key={m.id} className="card bg-base-100 p-3 border border-base-200">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-primary text-sm">{m.name}</span>
                    <span className="badge badge-xs badge-ghost font-mono">{m.chromosome || 'Chr?'}</span>
                  </div>
                  <div className="text-xs font-semibold">{m.gene_symbol || m.target_trait}</div>
                  <div className="text-[11px] text-muted truncate mt-1" title={m.effect_description}>
                    Fav: <span className="text-success font-medium">{m.favorable_allele}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* MAS Trait Stacking Heatmap Grid */}
            <div className="card bg-base-100 p-4">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h3 className="font-bold text-base">
                  🛡️ Germplasm Stacking Matrix (Lines × Diagnostic Markers)
                </h3>
                <span className="text-xs text-muted">
                  Click any allele call to edit or inspect genotype.
                </span>
              </div>

              {masLoading ? (
                <div className="p-8 text-center text-muted">Loading MAS Stacking Grid...</div>
              ) : masStackingRes && masStackingRes.lines.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table table-sm w-full border-collapse">
                    <thead>
                      <tr className="bg-base-200">
                        <th className="sticky left-0 bg-base-200 z-10">Germplasm Line</th>
                        <th>Program</th>
                        <th>Stacking Score</th>
                        <th>Favorable (+)</th>
                        {masStackingRes.markers.map(m => (
                          <th key={m.id} className="text-center min-w-[90px]" title={m.target_trait}>
                            <div className="font-bold text-xs">{m.name}</div>
                            <div className="text-[10px] text-muted font-normal">{m.chromosome}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {masStackingRes.lines.map(line => (
                        <tr key={line.germplasm_id} className="hover">
                          <td className="sticky left-0 bg-base-100 font-bold z-10">
                            {line.germplasm_name}
                          </td>
                          <td className="text-xs text-muted">{line.program_name}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <progress
                                className={`progress w-16 ${
                                  line.stacking_score >= 70
                                    ? 'progress-success'
                                    : line.stacking_score >= 40
                                    ? 'progress-warning'
                                    : 'progress-error'
                                }`}
                                value={line.stacking_score}
                                max="100"
                              />
                              <span className="font-bold text-xs font-mono">{line.stacking_score}%</span>
                            </div>
                          </td>
                          <td className="text-xs font-bold text-success">
                            {line.favorable_count} / {masStackingRes.total_markers}
                          </td>
                          {masStackingRes.markers.map(m => {
                            const call = line.calls[m.id]
                            const status = call?.call_status ?? 'missing'
                            let badgeClass = 'bg-slate-700 text-slate-300'
                            let icon = '?'

                            if (status === 'favorable') {
                              badgeClass = 'bg-emerald-600 text-white font-bold'
                              icon = '✓ Fav'
                            } else if (status === 'heterozygous') {
                              badgeClass = 'bg-amber-600 text-white font-semibold'
                              icon = 'Het'
                            } else if (status === 'unfavorable') {
                              badgeClass = 'bg-rose-600 text-white'
                              icon = '✗ Unfav'
                            }

                            return (
                              <td
                                key={m.id}
                                className="text-center p-1 cursor-pointer"
                                onClick={() => {
                                  if (canWrite) {
                                    setEditScoreModal({
                                      lineName: line.germplasm_name,
                                      germplasmId: line.germplasm_id,
                                      markerId: m.id,
                                      markerName: m.name,
                                      currentStatus: status,
                                      rawGt: call?.raw_genotype || '',
                                    })
                                  }
                                }}
                              >
                                <span className={`badge badge-xs px-2 py-1 text-[10px] rounded ${badgeClass}`}>
                                  {icon}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted">
                  No germplasm lines or diagnostic markers found in this program. Click 'Seed Default Wheat Markers'
                  above to populate the library!
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======================================================================== */}
      {/* MODAL 1: Train Genomic Prediction Model                                   */}
      {/* ======================================================================== */}
      {showTrainModal && (
        <Modal
          title="Train Genomic Prediction Model (GBLUP)"
          onClose={() => setShowTrainModal(false)}
        >
          <form onSubmit={handleTrainSubmit} className="space-y-4">
            <div>
              <label className="label text-sm font-semibold">Model Session Name</label>
              <input
                type="text"
                className="input input-bordered w-full input-sm"
                placeholder="e.g. 2026 Yield GBLUP Panel"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">Program</label>
                <select
                  className="select select-bordered w-full select-sm"
                  value={trainProgram}
                  onChange={e => setTrainProgram(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select Program</option>
                  {programList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label text-sm font-semibold">Target Trait</label>
                <select
                  className="select select-bordered w-full select-sm"
                  value={trainTrait}
                  onChange={e => setTrainTrait(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select Trait</option>
                  {traitList
                    .filter(t => t.data_type === 'numeric' || t.data_type === 'integer')
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.unit || 'unitless'})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label text-sm font-semibold">Genotype Dataset</label>
              <select
                className="select select-bordered w-full select-sm"
                value={trainDataset}
                onChange={e => setTrainDataset(e.target.value ? Number(e.target.value) : '')}
                required
              >
                <option value="">Select Genotype Dataset</option>
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.sample_count} samples, {d.marker_count} SNPs)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label text-sm font-semibold">Phenotype Training Source</label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="sourceType"
                    className="radio radio-sm radio-primary"
                    checked={trainSourceType === 'trial'}
                    onChange={() => setTrainSourceType('trial')}
                  />
                  Single Trial
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="sourceType"
                    className="radio radio-sm radio-primary"
                    checked={trainSourceType === 'analysis_set'}
                    onChange={() => setTrainSourceType('analysis_set')}
                  />
                  Multi-Environment Analysis Set
                </label>
              </div>

              {trainSourceType === 'trial' ? (
                <select
                  className="select select-bordered w-full select-sm"
                  value={trainTrial}
                  onChange={e => setTrainTrial(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select Training Trial</option>
                  {trialList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.trial_code} - {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className="select select-bordered w-full select-sm"
                  value={trainAnalysisSet}
                  onChange={e => setTrainAnalysisSet(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select Training Analysis Set</option>
                  {analysisSetList.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">Heritability Prior (h²)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="0.95"
                  className="input input-bordered w-full input-sm"
                  value={heritabilityPrior}
                  onChange={e => setHeritabilityPrior(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label text-sm font-semibold">Cross-Validation Folds (k)</label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  className="input input-bordered w-full input-sm"
                  value={kFolds}
                  onChange={e => setKFolds(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTrainModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={trainModelMutation.isPending}
              >
                {trainModelMutation.isPending ? 'Solving GBLUP MME...' : 'Train Model & Predict GEBVs'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================================== */}
      {/* MODAL 2: Upload Genotype Dataset                                          */}
      {/* ======================================================================== */}
      {showUploadModal && (
        <Modal
          title="Upload Genotype Dataset"
          onClose={() => setShowUploadModal(false)}
        >
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div>
              <label className="label text-sm font-semibold">Dataset Name</label>
              <input
                type="text"
                className="input input-bordered w-full input-sm"
                placeholder="e.g. 2026 25k SNP Array"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">Program</label>
                <select
                  className="select select-bordered w-full select-sm"
                  value={uploadProgram}
                  onChange={e => setUploadProgram(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select Program</option>
                  {programList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label text-sm font-semibold">File Format</label>
                <select
                  className="select select-bordered w-full select-sm"
                  value={uploadFormat}
                  onChange={e => setUploadFormat(e.target.value as any)}
                >
                  <option value="matrix">CSV/TSV Numeric Matrix (0,1,2)</option>
                  <option value="vcf">VCF (.vcf)</option>
                  <option value="hapmap">HapMap (.hmp.txt)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label text-sm font-semibold">Genotype File</label>
              <input
                type="file"
                className="file-input file-input-bordered w-full file-input-sm"
                accept=".vcf,.txt,.hmp.txt,.csv,.tsv"
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    setUploadFile(e.target.files[0])
                    if (!uploadName) {
                      setUploadName(e.target.files[0].name.replace(/\.[^/.]+$/, ''))
                    }
                  }
                }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">MAF Filter</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.5"
                  className="input input-bordered w-full input-sm"
                  value={uploadMaf}
                  onChange={e => setUploadMaf(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="label text-sm font-semibold">Missing Imputation</label>
                <select
                  className="select select-bordered w-full select-sm"
                  value={uploadImputation}
                  onChange={e => setUploadImputation(e.target.value)}
                >
                  <option value="mean">Mean Allele Dosage</option>
                  <option value="mode">Mode Genotype</option>
                  <option value="none">None (Filter only)</option>
                </select>
              </div>
            </div>

            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUploadModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={uploadDatasetMutation.isPending || !uploadFile}
              >
                {uploadDatasetMutation.isPending ? 'Parsing & Computing QC...' : 'Upload & Process Matrix'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================================== */}
      {/* MODAL 3: Add Custom Diagnostic Marker                                     */}
      {/* ======================================================================== */}
      {showAddMarkerModal && (
        <Modal
          title="Add Wheat Functional Diagnostic Marker"
          onClose={() => setShowAddMarkerModal(false)}
        >
          <form onSubmit={handleCreateMarkerSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">Marker Name</label>
                <input
                  type="text"
                  className="input input-bordered w-full input-sm"
                  placeholder="e.g. Fhb1-KASP"
                  value={markerName}
                  onChange={e => setMarkerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label text-sm font-semibold">Gene Symbol</label>
                <input
                  type="text"
                  className="input input-bordered w-full input-sm"
                  placeholder="e.g. TaHRC"
                  value={markerGene}
                  onChange={e => setMarkerGene(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">Chromosome</label>
                <input
                  type="text"
                  className="input input-bordered w-full input-sm"
                  placeholder="e.g. 3BS, 7DS"
                  value={markerChr}
                  onChange={e => setMarkerChr(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-sm font-semibold">Category</label>
                <select
                  className="select select-bordered w-full select-sm"
                  value={markerCategory}
                  onChange={e => setMarkerCategory(e.target.value as any)}
                >
                  <option value="disease">Disease Resistance</option>
                  <option value="agronomic">Agronomic / Height</option>
                  <option value="quality">Grain Quality</option>
                  <option value="phenology">Phenology / Adaptation</option>
                  <option value="abiotic">Abiotic Stress</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label text-sm font-semibold">Target Trait</label>
              <input
                type="text"
                className="input input-bordered w-full input-sm"
                placeholder="e.g. Fusarium Head Blight Resistance"
                value={markerTrait}
                onChange={e => setMarkerTrait(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">Favorable Allele</label>
                <input
                  type="text"
                  className="input input-bordered w-full input-sm"
                  placeholder="e.g. Resistant (FAM / G)"
                  value={markerFavAllele}
                  onChange={e => setMarkerFavAllele(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label text-sm font-semibold">Unfavorable Allele</label>
                <input
                  type="text"
                  className="input input-bordered w-full input-sm"
                  placeholder="e.g. Susceptible (HEX / A)"
                  value={markerUnfavAllele}
                  onChange={e => setMarkerUnfavAllele(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-sm font-semibold">Assay Type</label>
                <select
                  className="select select-bordered w-full select-sm"
                  value={markerAssay}
                  onChange={e => setMarkerAssay(e.target.value as any)}
                >
                  <option value="KASP">KASP Assay</option>
                  <option value="TaqMan">TaqMan Probe</option>
                  <option value="PCR_Gel">Gel / PCR Marker</option>
                  <option value="SNP_Chip">SNP Array Probe</option>
                </select>
              </div>
              <div>
                <label className="label text-sm font-semibold">Effect / Breeding Impact</label>
                <input
                  type="text"
                  className="input input-bordered w-full input-sm"
                  placeholder="Explains phenotypic effect..."
                  value={markerEffect}
                  onChange={e => setMarkerEffect(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddMarkerModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={createMarkerMutation.isPending}
              >
                Save Marker
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================================== */}
      {/* MODAL 4: Quick Edit MAS Allele Call                                       */}
      {/* ======================================================================== */}
      {editScoreModal && (
        <Modal
          title={`Edit MAS Call: ${editScoreModal.lineName} @ ${editScoreModal.markerName}`}
          onClose={() => setEditScoreModal(null)}
        >
          <form onSubmit={handleScoreSave} className="space-y-4">
            <div>
              <label className="label text-sm font-semibold">Call Designation</label>
              <select
                className="select select-bordered w-full select-sm"
                value={editScoreModal.currentStatus}
                onChange={e =>
                  setEditScoreModal({ ...editScoreModal, currentStatus: e.target.value })
                }
              >
                <option value="favorable">✓ Favorable (Resistant / Desired)</option>
                <option value="heterozygous">Heterozygous (Carrier)</option>
                <option value="unfavorable">✗ Unfavorable (Susceptible / Wildtype)</option>
                <option value="missing">? Missing (No Call)</option>
              </select>
            </div>

            <div>
              <label className="label text-sm font-semibold">Raw Genotype String</label>
              <input
                type="text"
                className="input input-bordered w-full input-sm"
                placeholder="e.g. A:A, G:G, FAM"
                value={editScoreModal.rawGt}
                onChange={e =>
                  setEditScoreModal({ ...editScoreModal, rawGt: e.target.value })
                }
              />
            </div>

            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditScoreModal(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={updateScoreMutation.isPending}
              >
                Save Call
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

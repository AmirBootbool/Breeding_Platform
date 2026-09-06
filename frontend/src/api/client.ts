/**
 * Typed API client for the Wheat Breeding Platform backend.
 * All requests are proxied via Vite devServer → Django at :8000.
 */

const BASE = '/api'

// ---- Types ----------------------------------------------------------------

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Program {
  id: number
  name: string
  crop: string
  description: string
  created_at: string
  created_by_username?: string | null
  updated_by_username?: string | null
}


export interface Location {
  id: number
  name: string
  country: string
  region: string
  latitude: number | null
  longitude: number | null
  created_at?: string
  updated_at?: string
  created_by_username?: string | null
  updated_by_username?: string | null
}

export interface Season {
  id: number
  name: string
  year: number
  program: number
  program_name: string
  created_by_username?: string | null
  updated_by_username?: string | null
}

export interface Germplasm {
  id: number
  name: string
  germplasm_db_id: string
  species: string
  program: number
  program_name: string
  cross_type: string
  generation: number
  year_developed: number | null
  pedigree_string: string
  tags: string[]
  is_check: boolean
  notes: string
  is_archived?: boolean
  created_at: string
  updated_at?: string
  parent_female: number | null
  parent_female_name: string | null
  parent_male: number | null
  parent_male_name: string | null
  created_by_username?: string | null
  updated_by_username?: string | null
}

export interface PedigreeNode {
  id: number
  name: string
  germplasm_db_id: string
  species: string
  program_id: number
  program_name: string
  cross_type: string
  generation: number
  generation_label: string
  pedigree_string: string
  year_developed: number | null
  has_cycle?: boolean
  parent_female: PedigreeNode | null
  parent_male: PedigreeNode | null
  progeny?: PedigreeNode[]
}

export interface SeedTransaction {
  id: number
  seed_lot: number
  transaction_type: 'initial_deposit' | 'harvest_deposit' | 'planting_deduction' | 'distribution' | 'adjustment'
  quantity_grams: number
  transaction_date: string
  destination_trial?: number | null
  destination_trial_name?: string | null
  notes: string
  created_by?: number | null
  created_by_username?: string | null
  created_at: string
}

export interface SeedLot {
  id: number
  germplasm: number
  germplasm_name: string
  germplasm_db_id: string
  program: number
  program_name: string
  lot_code: string
  quantity_grams: number
  seed_count: number | null
  storage_location: string
  harvest_date: string | null
  source_plot: number | null
  source_plot_number: number | null
  germination_rate: number | null
  status: 'available' | 'depleted' | 'reserved' | 'quarantine'
  is_low_stock: boolean
  notes: string
  recent_transactions: SeedTransaction[]
  created_at: string
  updated_at: string
  created_by_username?: string | null
}

export interface Trial {
  id: number
  name: string
  trial_code: string
  program: number
  program_name: string
  location: number
  location_name: string
  season: number
  season_name: string
  design_type: string
  num_reps: number
  block_size: number | null
  prep_fraction: number | null
  field_rows?: number | null
  field_cols?: number | null
  starting_corner?: 'BL' | 'BR' | 'TL' | 'TR'
  advancement_direction?: 'up' | 'right' | 'up_right' | 'right_up'
  layout_schema?: 'h_serpentine' | 'v_serpentine' | 'h_cartesian' | 'v_cartesian'
  plot_count: number
  planting_date: string | null
  harvest_date: string | null
  notes: string
  status: 'active' | 'completed' | 'archived'
  generation: number | null
  created_at: string
  created_by_username?: string | null
  updated_by_username?: string | null
}

export interface Plot {
  id: number
  trial: number
  trial_code: string
  germplasm: number
  germplasm_name: string
  rep: number
  block: number | null
  incomplete_block: number | null
  is_check: boolean
  is_border?: boolean
  row: number | null
  column: number | null
  position: number | null
  plot_number: number
  status: string
}

export interface ObservationVariable {
  id: number
  name: string
  variable_code: string
  unit: string
  data_type: string
  crop?: string
  category?: string
  categorical_options?: string[]
  panel_ids?: number[]
  usage_count?: number
  min_value: number | null
  max_value: number | null
  is_required: boolean
  description: string
  created_at?: string
  updated_at?: string
  created_by_username?: string | null
  updated_by_username?: string | null
}

export interface TraitPanel {
  id: number
  name: string
  description: string
  category: string
  program: number | null
  program_name: string | null
  variable_ids: number[]
  variable_details: ObservationVariable[]
  variable_count: number
  created_by_username: string | null
  created_at: string
  updated_at: string
}

export const CROP_CHOICES = [
  { value: 'wheat', label: 'Bread Wheat (Triticum aestivum)' },
  { value: 'durum_wheat', label: 'Durum Wheat (Triticum durum)' },
  { value: 'barley', label: 'Barley (Hordeum vulgare)' },
  { value: 'triticale', label: 'Triticale (x Triticosecale)' },
  { value: 'oats', label: 'Oats (Avena sativa)' },
  { value: 'rye', label: 'Rye (Secale cereale)' },
  { value: 'other', label: 'Other Crop' },
]

export type Trait = ObservationVariable

export interface Observation {
  id: number
  plot: number
  variable: number
  variable_name: string
  value_numeric: number | null
  value_text: string
  value_date: string | null
  observation_time: string | null
  notes: string
}

export interface TrialSummaryRow {
  variable: string
  unit: string
  count: number
  mean: number | null
  min: number | null
  max: number | null
  std_dev: number | null
  cv_percent: number | null
}

// ---- Fetch helper ----------------------------------------------------------

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('wbp-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Token ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.errors ?? body)
  }

  // 204 No Content has no body
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export async function downloadFile(path: string, defaultFilename: string) {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Token ${token}`

  const res = await fetch(`${BASE}${path}`, { headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.errors ?? body)
  }

  // Get filename from Content-Disposition if possible
  let filename = defaultFilename
  const disposition = res.headers.get('Content-Disposition')
  if (disposition && disposition.indexOf('filename=') !== -1) {
    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
    const matches = filenameRegex.exec(disposition)
    if (matches != null && matches[1]) {
      filename = matches[1].replace(/['"]/g, '')
    }
  }

  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  a.remove()
}

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`API ${status}`)
  }
}

// ---- Auth ------------------------------------------------------------------

export async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/auth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})))
  return res.json() as Promise<{ token: string }>
}

// ---- Programs --------------------------------------------------------------

export const programs = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<Program>>(`/programs/?page_size=100${params}`),
  create: (data: Partial<Program>) =>
    apiFetch<Program>('/programs/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Program>) =>
    apiFetch<Program>(`/programs/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/programs/${id}/`, { method: 'DELETE' }),
}

// ---- Locations -------------------------------------------------------------

export const locations = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<Location>>(`/locations/?page_size=200${params}`),
  create: (data: Partial<Location>) =>
    apiFetch<Location>('/locations/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Location>) =>
    apiFetch<Location>(`/locations/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/locations/${id}/`, { method: 'DELETE' }),
}


// ---- Seasons ---------------------------------------------------------------

export const seasons = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<Season>>(`/seasons/?page_size=200${params}`),
  create: (data: Partial<Season>) =>
    apiFetch<Season>('/seasons/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Season>) =>
    apiFetch<Season>(`/seasons/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/seasons/${id}/`, { method: 'DELETE' }),
}

// ---- Germplasm -------------------------------------------------------------

export const germplasm = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<Germplasm>>(`/germplasm/?page_size=50${params}`),
  listAll: () =>
    apiFetch<PaginatedResponse<Germplasm>>('/germplasm/?page_size=500'),
  detail: (id: number) => apiFetch<Germplasm>(`/germplasm/${id}/`),
  create: (data: Partial<Germplasm>) =>
    apiFetch<Germplasm>('/germplasm/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Germplasm>) =>
    apiFetch<Germplasm>(`/germplasm/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/germplasm/${id}/`, { method: 'DELETE' }),
  bulkArchive: (ids: number[]) =>
    apiFetch<{ archived_count: number }>(`/germplasm/bulk_archive/`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  bulkDelete: (ids: number[]) =>
    apiFetch<{ deleted_count: number }>(`/germplasm/bulk_delete/`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  advanceGeneration: (germplasm_ids: number[], method: string, ssd_count: number = 1) =>
    apiFetch<{ created_count: number; created_ids: number[] }>(`/germplasm/advance/`, {
      method: 'POST',
      body: JSON.stringify({ germplasm_ids, method, ssd_count }),
    }),
  bulkImport: async (file: File, program: string, dryRun: boolean) => {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Token ${token}`
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('program', program)
    formData.append('dry_run', dryRun ? 'true' : 'false')

    const res = await fetch(`${BASE}/germplasm/bulk_import/`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new ApiError(res.status, body?.errors ?? body)
    }

    return res.json() as Promise<{
      created: number
      skipped: number
      errors: { row: number; detail: string }[]
    }>
  },
  getPedigreeTree: (id: number, depth: number = 3, direction: string = 'ancestors') =>
    apiFetch<PedigreeNode>(`/germplasm/${id}/pedigree_tree/?depth=${depth}&direction=${direction}`),
}

export interface FieldBookImportResult {
  imported_count: number
  updated_count: number
  matched_variables: string[]
  errors: { row: number; detail: string | Record<string, string[]> }[]
  dry_run: boolean
}

// ---- Trials ----------------------------------------------------------------

export const trials = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<Trial>>(`/trials/?page_size=100${params}`),
  detail: (id: number) => apiFetch<Trial>(`/trials/${id}/`),
  create: (data: Partial<Trial>) =>
    apiFetch<Trial>('/trials/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Trial>) =>
    apiFetch<Trial>(`/trials/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/trials/${id}/`, { method: 'DELETE' }),
  createPlots: (id: number, body: { germplasm_ids?: number[]; seed?: number; check_germplasm_ids?: number[] }) =>
    apiFetch<{ trial: string; created_count: number; plots: Plot[] }>(
      `/trials/${id}/create_plots/`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  advancePlots: (id: number, body: { plot_ids: number[], selections_per_plot: number, selection_method: string }) =>
    apiFetch<{ detail: string, created_count: number; created_ids: number[] }>(
      `/trials/${id}/advance_plots/`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  summary: (id: number) =>
    apiFetch<{ trial: string; summary: TrialSummaryRow[] }>(`/trials/${id}/summary/`),
  exportMap: (id: number) => downloadFile(`/trials/${id}/export_map/`, `trial-${id}-map.csv`),
  exportBook: (id: number) => downloadFile(`/trials/${id}/export_fieldbook/`, `trial-${id}-fieldbook.csv`),
  exportFieldBook: (id: number) => downloadFile(`/trials/${id}/export_fieldbook/`, `trial-${id}-fieldbook.csv`),
  importFieldBook: async (trialId: number, file: File, dryRun: boolean = false): Promise<FieldBookImportResult> => {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Token ${token}`
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('dry_run', dryRun ? 'true' : 'false')

    const res = await fetch(`${BASE}/trials/${trialId}/import_fieldbook/`, {
      method: 'POST',
      headers,
      body: formData,
    })

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ApiError(res.status, body?.errors ?? body)
    }

    return body as FieldBookImportResult
  },
  harvestPlots: (id: number, plot_ids: number[], method: string, ssd_count: number = 1) =>
    apiFetch<{ created_count: number; created_ids: number[] }>(`/trials/${id}/harvest_plots/`, {
      method: 'POST',
      body: JSON.stringify({ plot_ids, method, ssd_count }),
    }),
  getSpatialHeatmap: (trialId: number, variableId: number) =>
    apiFetch<SpatialHeatmapData>(`/trials/${trialId}/spatial_heatmap/?variable_id=${variableId}`),
  batchUpdatePlots: (trialId: number, plots: Partial<Plot>[]) =>
    apiFetch<{ detail: string; updated_count: number }>(`/trials/${trialId}/batch_update_plots/`, {
      method: 'PATCH',
      body: JSON.stringify({ plots }),
    }),
  addGridCells: (trialId: number, data: { type: 'row' | 'column'; location: string; count: number; fill_germplasm_id?: number; is_border?: boolean }) =>
    apiFetch<{ detail: string; created_count: number; field_rows: number; field_cols: number }>(`/trials/${trialId}/add_grid_cells/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ---- Plots -----------------------------------------------------------------

export const plots = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<Plot>>(`/plots/?page_size=500${params}`),
}

// ---- Observation Variables -------------------------------------------------

export const observationVariables = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<ObservationVariable>>(
      `/observation-variables/?page_size=200${params}`
    ),
  create: (data: Partial<ObservationVariable>) =>
    apiFetch<ObservationVariable>('/observation-variables/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<ObservationVariable>) =>
    apiFetch<ObservationVariable>(`/observation-variables/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  destroy: (id: number) =>
    apiFetch<void>(`/observation-variables/${id}/`, { method: 'DELETE' }),
}

export const traits = observationVariables

export const traitPanels = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<TraitPanel>>(`/trait-panels/?page_size=100${params}`),
  detail: (id: number) => apiFetch<TraitPanel>(`/trait-panels/${id}/`),
  create: (data: Partial<TraitPanel> & { variable_ids: number[] }) =>
    apiFetch<TraitPanel>('/trait-panels/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<TraitPanel> & { variable_ids?: number[] }) =>
    apiFetch<TraitPanel>(`/trait-panels/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/trait-panels/${id}/`, { method: 'DELETE' }),
}

// ---- Observations ----------------------------------------------------------

export const observations = {
  create: (data: Partial<Observation>) =>
    apiFetch<Observation>('/observations/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  list: (params = '') =>
    apiFetch<PaginatedResponse<Observation>>(`/observations/?page_size=100${params}`),
  bulkCreate: (data: { observations: Partial<Observation>[] }) =>
    apiFetch<{
      created: Observation[]
      errors: { index: number; detail: unknown }[]
    }>('/observations/bulk_create/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ---- Audit Log --------------------------------------------------------------

export interface AuditLogEntry {
  model: string
  id: number
  label: string
  action?: string
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface AuditFilterParams {
  model?: string
  user?: string
  search?: string
  limit?: number
}

export const audit = {
  recentChanges: (limit = 50) =>
    apiFetch<AuditLogEntry[]>(`/audit/recent_changes/?limit=${limit}`),
  getRecentChanges: (params?: AuditFilterParams) => {
    const searchParams = new URLSearchParams()
    if (params?.model) searchParams.set('model', params.model)
    if (params?.user) searchParams.set('user', params.user)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return apiFetch<AuditLogEntry[]>(`/audit/recent_changes/${qs}`)
  },
  getEntityHistory: (model: string, id: number) =>
    apiFetch<AuditLogEntry[]>(`/audit/entity_history/?model=${encodeURIComponent(model)}&id=${id}`),
}

// ---- Analysis Sets ----------------------------------------------------------

export interface AnalysisSet {
  id: number
  name: string
  program: number
  program_name: string
  trials: number[]
  trial_details: Trial[]
  description: string
  created_at: string
  created_by_username: string
}

export interface HeritabilityResponse {
  h2: number | null
  variance_genotype: number | null
  variance_gxe: number | null
  variance_residual: number | null
  n_environments: number
  n_genotypes: number
  warning: string | null
}

export interface RankingEntry {
  germplasm: string
  adjusted_mean: number
  raw_mean: number
  n_observations: number
  n_environments: number
  family_group: string | null
  raw_means_by_env: Record<string, number>
}

export const analysisSets = {
  list: () =>
    apiFetch<PaginatedResponse<AnalysisSet>>('/analysis-sets/?page_size=100'),
  create: (data: Partial<AnalysisSet>) =>
    apiFetch<AnalysisSet>('/analysis-sets/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<AnalysisSet>) =>
    apiFetch<AnalysisSet>(`/analysis-sets/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  destroy: (id: number) =>
    apiFetch<void>(`/analysis-sets/${id}/`, { method: 'DELETE' }),
  getHeritability: (id: number, variableId: number) =>
    apiFetch<HeritabilityResponse>(`/analysis-sets/${id}/heritability/?variable=${variableId}`),
  getRanking: (id: number, variableId: number) =>
    apiFetch<RankingEntry[]>(`/analysis-sets/${id}/ranking/?variable=${variableId}`),
}

// ---- Crossing Blocks --------------------------------------------------------

export interface CrossingBlock {
  id: number
  name: string
  program: number
  program_name: string
  location: number | null
  location_name: string | null
  season: number | null
  season_name: string | null
  map_pattern: 'male_first' | 'female_first' | 'alternating'
  include_reciprocals: boolean
  cross_count: number
  notes: string
  created_at: string
  updated_at: string
  crosses?: CrossEntry[]
}

export interface CrossEntry {
  id: number
  cross_code: string
  female_parent: number
  female_parent_name: string
  male_parent: number
  male_parent_name: string
  status: string
  is_reciprocal: boolean
  map_position: number | null
  progeny: number | null
  progeny_name: string | null
  cross_date: string
  notes: string
}

export interface CrossingMapEntry {
  position: number
  type: 'parent' | 'cross'
  entry_name: string
  cross_code: string | null
  female_name: string | null
  male_name: string | null
}

export const crossingBlocks = {
  list: () =>
    apiFetch<PaginatedResponse<CrossingBlock>>('/crossing-blocks/?page_size=100'),
  detail: (id: number) =>
    apiFetch<CrossingBlock>(`/crossing-blocks/${id}/`),
  create: (data: Partial<CrossingBlock>) =>
    apiFetch<CrossingBlock>('/crossing-blocks/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<CrossingBlock>) =>
    apiFetch<CrossingBlock>(`/crossing-blocks/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/crossing-blocks/${id}/`, { method: 'DELETE' }),
  planCrosses: (id: number, data: { female_ids: number[]; male_ids: number[] }) =>
    apiFetch<{ created_count: number; crosses: CrossEntry[] }>(
      `/crossing-blocks/${id}/plan_crosses/`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  executeAll: (id: number) =>
    apiFetch<{ executed_count: number; progeny: { id: number; name: string; germplasm_db_id: string }[] }>(
      `/crossing-blocks/${id}/execute_all/`,
      { method: 'POST' }
    ),
  getCrossingMap: (id: number) =>
    apiFetch<{ map: CrossingMapEntry[] }>(`/crossing-blocks/${id}/crossing_map/`),
  exportMap: (id: number) => downloadFile(`/crossing-blocks/${id}/export_map/`, `crossing_map.csv`),
  bulkUpdateStatus: (id: number, data: { cross_ids: number[]; status: string; notes?: string }) =>
    apiFetch<{ updated_count: number; status: string }>(
      `/crossing-blocks/${id}/bulk_status/`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
}

export interface BarcodeLabelData {
  lot_code: string
  germplasm_name: string
  germplasm_db_id: string
  species: string
  program_name: string
  quantity_grams: number
  storage_location: string
  harvest_date: string
  source_plot: string | number
  barcode_text: string
  qr_payload: string
}

export const seedLots = {
  list: (params: string = '') =>
    apiFetch<PaginatedResponse<SeedLot>>(`/seed-lots/?page_size=100${params}`),
  detail: (id: number) =>
    apiFetch<SeedLot>(`/seed-lots/${id}/`),
  create: (data: Partial<SeedLot>) =>
    apiFetch<SeedLot>('/seed-lots/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<SeedLot>) =>
    apiFetch<SeedLot>(`/seed-lots/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  destroy: (id: number) =>
    apiFetch<void>(`/seed-lots/${id}/`, { method: 'DELETE' }),
  adjust: (id: number, data: { transaction_type?: string; quantity_grams: number; destination_trial?: number | null; notes?: string }) =>
    apiFetch<{ status: string; transaction: SeedTransaction; seed_lot: SeedLot }>(
      `/seed-lots/${id}/adjust/`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  split: (id: number, data: { quantity_grams: number; storage_location?: string; notes?: string }) =>
    apiFetch<{ status: string; parent_lot: SeedLot; new_lot: SeedLot }>(
      `/seed-lots/${id}/split/`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  getLabelData: (id: number) =>
    apiFetch<BarcodeLabelData>(`/seed-lots/${id}/label/`),
  getBulkLabels: (lotIds: number[]) =>
    apiFetch<{ labels: BarcodeLabelData[]; count: number }>(
      '/seed-lots/bulk-labels/',
      { method: 'POST', body: JSON.stringify({ lot_ids: lotIds }) }
    ),
  getLowStock: (threshold: number = 50.0) =>
    apiFetch<SeedLot[]>(`/seed-lots/low_stock/?threshold=${threshold}`),
}

export const seedTransactions = {
  list: (params: string = '') =>
    apiFetch<PaginatedResponse<SeedTransaction>>(`/seed-transactions/?page_size=100${params}`),
}

export interface SpatialPlotCell {
  plot_id: number
  plot_number: number
  row: number
  column: number
  rep: number
  block: number | null
  germplasm_id: number
  germplasm_name: string
  is_check: boolean
  status: string
  raw_value: number | null
  normalized_value: number | null
  notes: string
}

export interface SpatialMarginSummary {
  row?: number
  column?: number
  mean: number | null
  count: number
}

export interface SpatialHeatmapData {
  trial_id: number
  trial_code: string
  variable: {
    id: number
    name: string
    unit: string
    data_type: string
  }
  stats: {
    min: number | null
    max: number | null
    mean: number | null
    count: number
  }
  dimensions: {
    rows: number
    columns: number
    coordinate_type: string
  }
  row_margins: SpatialMarginSummary[]
  col_margins: SpatialMarginSummary[]
  cells: SpatialPlotCell[]
}



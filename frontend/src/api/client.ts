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
  year_developed: number | null
  pedigree_string: string
  notes: string
  parent_female: number | null
  parent_female_name: string | null
  parent_male: number | null
  parent_male_name: string | null
  created_by_username?: string | null
  updated_by_username?: string | null
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
  plot_count: number
  planting_date: string | null
  harvest_date: string | null
  notes: string
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
  min_value: number | null
  max_value: number | null
  is_required: boolean
  description: string
  created_at?: string
  updated_at?: string
  created_by_username?: string | null
  updated_by_username?: string | null
}

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
  summary: (id: number) =>
    apiFetch<{ trial: string; summary: TrialSummaryRow[] }>(`/trials/${id}/summary/`),
  exportCsvUrl: (id: number) => `${BASE}/trials/${id}/export_csv/`,
  exportFieldbookUrl: (id: number) => `${BASE}/trials/${id}/export_fieldbook/`,
}

// ---- Plots -----------------------------------------------------------------

export const plots = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<Plot>>(`/plots/?page_size=500${params}`),
}

// ---- Observation Variables -------------------------------------------------

export const observationVariables = {
  list: () =>
    apiFetch<PaginatedResponse<ObservationVariable>>(
      '/observation-variables/?page_size=200'
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

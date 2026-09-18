import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { preferences, UserPreferences } from '../api/client'

export interface ColumnConfig {
  visibleKeys: string[]
  order?: string[]
}

export interface SavedView {
  id: string
  name: string
  filters: Record<string, unknown>
  columnConfig?: ColumnConfig
  sort?: { key: string; direction: 'asc' | 'desc' }
  isDefault?: boolean
}

export interface DashboardWidgetConfig {
  id: string
  visible: boolean
  order: number
}

export interface PinnedRecord {
  id: number
  type: 'germplasm' | 'trial' | 'cross'
  label: string
}

export interface PreferencesState {
  theme: 'dark' | 'light' | 'sunlight'
  tableDensity: 'comfortable' | 'compact'
  defaultLandingPage: string
  columnConfig: Record<string, ColumnConfig>
  savedViews: Record<string, SavedView[]>
  dashboardWidgets: DashboardWidgetConfig[]
  pinnedRecords: PinnedRecord[]
  _lastSyncedAt: string | null
  _lastModifiedLocally: number

  setTheme: (theme: 'dark' | 'light' | 'sunlight') => void
  toggleTheme: () => void
  set: <K extends keyof PreferencesState>(key: K, value: PreferencesState[K]) => void
  syncNow: () => Promise<void>
  hydrateFromServer: (data: UserPreferences) => void
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSyncToBackend(stateSnapshot: Partial<PreferencesState>) {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }

  syncTimeout = setTimeout(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return
    }

    try {
      const payload: Record<string, unknown> = {
        theme: stateSnapshot.theme,
        tableDensity: stateSnapshot.tableDensity,
        defaultLandingPage: stateSnapshot.defaultLandingPage,
        columnConfig: stateSnapshot.columnConfig,
        savedViews: stateSnapshot.savedViews,
        dashboardWidgets: stateSnapshot.dashboardWidgets,
        pinnedRecords: stateSnapshot.pinnedRecords,
      }
      const res = await preferences.patch(payload)
      usePreferencesStore.setState({ _lastSyncedAt: res.updated_at })
    } catch (err) {
      console.warn('Preferences push failed (will retry on next change):', err)
    }
  }, 500)
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      tableDensity: 'comfortable',
      defaultLandingPage: '/',
      columnConfig: {},
      savedViews: {},
      dashboardWidgets: [],
      pinnedRecords: [],
      _lastSyncedAt: null,
      _lastModifiedLocally: 0,

      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme, _lastModifiedLocally: Date.now() })
        debouncedSyncToBackend(get())
      },

      toggleTheme: () => {
        const current = get().theme
        const next = current === 'dark' ? 'light' : current === 'light' ? 'sunlight' : 'dark'
        document.documentElement.setAttribute('data-theme', next)
        set({ theme: next, _lastModifiedLocally: Date.now() })
        debouncedSyncToBackend(get())
      },

      set: (key, value) => {
        set({ [key]: value, _lastModifiedLocally: Date.now() } as unknown as Partial<PreferencesState>)
        debouncedSyncToBackend(get())
      },

      syncNow: async () => {
        if (syncTimeout) {
          clearTimeout(syncTimeout)
          syncTimeout = null
        }
        const state = get()
        const payload: Record<string, unknown> = {
          theme: state.theme,
          tableDensity: state.tableDensity,
          defaultLandingPage: state.defaultLandingPage,
          columnConfig: state.columnConfig,
          savedViews: state.savedViews,
          dashboardWidgets: state.dashboardWidgets,
          pinnedRecords: state.pinnedRecords,
        }
        const res = await preferences.patch(payload)
        set({ _lastSyncedAt: res.updated_at })
      },

      hydrateFromServer: (serverData: UserPreferences) => {
        const localLastSynced = get()._lastSyncedAt
        const serverUpdatedAt = serverData.updated_at
        const lastMod = get()._lastModifiedLocally

        if (!serverUpdatedAt) return

        // If local modifications were made in the last 2 seconds, do not overwrite with server data
        if (Date.now() - lastMod < 2000) return

        // Merge server state if server timestamp is newer or no local sync timestamp exists
        if (!localLastSynced || new Date(serverUpdatedAt) > new Date(localLastSynced)) {
          const raw = serverData.data || {}
          const newTheme = (raw.theme as PreferencesState['theme']) || get().theme || 'dark'

          document.documentElement.setAttribute('data-theme', newTheme)

          set({
            theme: newTheme,
            tableDensity: (raw.tableDensity as PreferencesState['tableDensity']) || get().tableDensity,
            defaultLandingPage: (raw.defaultLandingPage as string) || get().defaultLandingPage,
            columnConfig: (raw.columnConfig as Record<string, ColumnConfig>) || get().columnConfig,
            savedViews: (raw.savedViews as Record<string, SavedView[]>) || get().savedViews,
            dashboardWidgets: (raw.dashboardWidgets as DashboardWidgetConfig[]) || get().dashboardWidgets,
            pinnedRecords: (raw.pinnedRecords as PinnedRecord[]) || get().pinnedRecords,
            _lastSyncedAt: serverUpdatedAt,
          })
        }
      },
    }),
    {
      name: 'wbp-user-preferences',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)

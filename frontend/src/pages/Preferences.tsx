import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sun,
  Moon,
  SunMedium,
  Layout,
  Table,
  CheckCircle2,
  RefreshCw,
  Sliders,
} from 'lucide-react'
import TopBar from '../components/TopBar'
import { usePreferencesStore } from '../store/preferencesStore'
import { useToast } from '../components/common/ToastProvider'
import { programs } from '../api/client'

const LANDING_PAGES = [
  { path: '/', label: 'Dashboard' },
  { path: '/germplasm', label: 'Germplasm Browser' },
  { path: '/crosses', label: 'Crossing Block' },
  { path: '/seed-inventory', label: 'Seed Inventory' },
  { path: '/trials', label: 'Trial Manager' },
  { path: '/observations', label: 'Observation Entry' },
  { path: '/traits', label: 'Traits' },
  { path: '/genomics', label: 'Genomics & MAS' },
  { path: '/analysis', label: 'Multi-Environment Analysis' },
  { path: '/export', label: 'Data Export' },
  { path: '/audit', label: 'Audit Trail' },
  { path: '/setup', label: 'Setup' },
]

const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO 8601)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (UK / International)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
]

export default function Preferences() {
  const {
    theme,
    setTheme,
    tableDensity,
    defaultLandingPage,
    _lastSyncedAt,
    set,
    syncNow,
  } = usePreferencesStore()
  const { showToast } = useToast()
  const [isSyncing, setIsSyncing] = useState(false)
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD')

  const { data: programData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
    staleTime: 60_000,
  })

  const programList = programData?.results ?? []

  const handleSyncNow = async () => {
    setIsSyncing(true)
    try {
      await syncNow()
      showToast('Preferences synchronized with server', 'success')
    } catch (e) {
      showToast('Failed to sync preferences to server', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="page">
      <TopBar
        title="User Preferences"
        subtitle="Manage display theme, table density, and personal workflow defaults"
      />

      <div className="content max-w-4xl">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          {/* Theme & Appearance */}
          <div className="card">
            <div className="card-header flex items-center gap-2 mb-4">
              <Sliders size={18} className="text-brand-400" />
              <h2 className="text-base font-semibold">Theme & Appearance</h2>
            </div>
            <p className="text-sm text-muted mb-4">
              Choose an interface theme suited for your working environment.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
              <button
                type="button"
                id="pref-theme-dark"
                className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-2)',
                  height: 'auto',
                  border: theme === 'dark' ? '2px solid var(--brand-400)' : '1px solid var(--border-subtle)',
                }}
                onClick={() => {
                  setTheme('dark')
                  showToast('Theme updated to Dark Mode', 'info')
                }}
              >
                <Moon size={22} className="mb-1" />
                <span className="text-xs font-semibold">Dark</span>
                <span className="text-xs text-muted">Low-light</span>
              </button>

              <button
                type="button"
                id="pref-theme-light"
                className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-2)',
                  height: 'auto',
                  border: theme === 'light' ? '2px solid var(--brand-400)' : '1px solid var(--border-subtle)',
                }}
                onClick={() => {
                  setTheme('light')
                  showToast('Theme updated to Light Mode', 'info')
                }}
              >
                <Sun size={22} className="mb-1" />
                <span className="text-xs font-semibold">Light</span>
                <span className="text-xs text-muted">Office</span>
              </button>

              <button
                type="button"
                id="pref-theme-sunlight"
                className={`btn ${theme === 'sunlight' ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-2)',
                  height: 'auto',
                  border: theme === 'sunlight' ? '2px solid var(--brand-400)' : '1px solid var(--border-subtle)',
                }}
                onClick={() => {
                  setTheme('sunlight')
                  showToast('Theme updated to High-Contrast Sunlight Mode', 'info')
                }}
              >
                <SunMedium size={22} className="mb-1" />
                <span className="text-xs font-semibold">Sunlight</span>
                <span className="text-xs text-muted">High Contrast</span>
              </button>
            </div>
          </div>

          {/* Table & Display Density */}
          <div className="card">
            <div className="card-header flex items-center gap-2 mb-4">
              <Table size={18} className="text-brand-400" />
              <h2 className="text-base font-semibold">Data & Table Layout</h2>
            </div>
            <p className="text-sm text-muted mb-4">
              Adjust table row height and information density across all data tables.
            </p>

            <div className="form-group mb-4">
              <label className="form-label" htmlFor="pref-table-density">Table Density</label>
              <select
                id="pref-table-density"
                className="form-input"
                value={tableDensity}
                onChange={(e) => {
                  const val = e.target.value as 'comfortable' | 'compact'
                  set('tableDensity', val)
                  showToast(`Table density set to ${val}`, 'info')
                }}
              >
                <option value="comfortable">Comfortable (Standard row spacing)</option>
                <option value="compact">Compact (High density, more rows per screen)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pref-date-format">Date Display Format</label>
              <select
                id="pref-date-format"
                className="form-input"
                value={dateFormat}
                onChange={(e) => {
                  setDateFormat(e.target.value)
                  showToast(`Date format set to ${e.target.value}`, 'info')
                }}
              >
                {DATE_FORMATS.map((df) => (
                  <option key={df.value} value={df.value}>
                    {df.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Navigation & Defaults */}
          <div className="card">
            <div className="card-header flex items-center gap-2 mb-4">
              <Layout size={18} className="text-brand-400" />
              <h2 className="text-base font-semibold">Navigation & Startup</h2>
            </div>
            <p className="text-sm text-muted mb-4">
              Configure which page loads after logging in.
            </p>

            <div className="form-group mb-4">
              <label className="form-label" htmlFor="pref-landing-page">Default Landing Page</label>
              <select
                id="pref-landing-page"
                className="form-input"
                value={defaultLandingPage}
                onChange={(e) => {
                  set('defaultLandingPage', e.target.value)
                  showToast(`Landing page set to ${e.target.value}`, 'info')
                }}
              >
                {LANDING_PAGES.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.label} ({p.path})
                  </option>
                ))}
              </select>
            </div>

            {programList.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="pref-default-program">Default Breeding Program</label>
                <select id="pref-default-program" className="form-input" defaultValue="">
                  <option value="">All Programs (Default)</option>
                  {programList.map((prog) => (
                    <option key={prog.id} value={prog.id}>
                      {prog.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Sync & Device Storage */}
          <div className="card">
            <div className="card-header flex items-center gap-2 mb-4">
              <RefreshCw size={18} className="text-brand-400" />
              <h2 className="text-base font-semibold">Cloud Sync & Persistence</h2>
            </div>
            <p className="text-sm text-muted mb-4">
              Your preferences are cached in local browser storage and continuously synchronized with your user profile.
            </p>

            <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: 'var(--status-success)' }}>
              <CheckCircle2 size={16} />
              <span>
                {_lastSyncedAt
                  ? `Last synced: ${new Date(_lastSyncedAt).toLocaleString()}`
                  : 'Locally cached (sync on next network pulse)'}
              </span>
            </div>

            <button
              id="pref-sync-now-btn"
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-2"
              onClick={handleSyncNow}
              disabled={isSyncing}
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync Preferences Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Menu, Sun, Moon, Search } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { usePreferencesStore } from '../store/preferencesStore'
import { programs } from '../api/client'
import OfflineSyncBadge from './common/OfflineSyncBadge'
import Breadcrumbs, { type BreadcrumbItem } from './common/Breadcrumbs'
import NotificationCenter from './common/NotificationCenter'
import './TopBar.css'

interface TopBarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  breadcrumbs?: BreadcrumbItem[]
}

export default function TopBar({ title, subtitle, actions, breadcrumbs }: TopBarProps) {
  const {
    toggleMobileSidebar,
    activeProgramId,
    setActiveProgramId,
    toggleCommandPalette,
  } = useUiStore()

  const { theme, toggleTheme } = usePreferencesStore()

  const { data: programData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
    staleTime: 60_000,
  })

  const programList = programData?.results ?? []

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button
          className="topbar-menu-btn"
          onClick={toggleMobileSidebar}
          title="Open navigation menu"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <div className="topbar-text">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumbs crumbs={breadcrumbs} className="mb-1" />
          )}
          <h1>{title}</h1>
          {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
        </div>
      </div>

      <div className="topbar-center">
        {/* Command Palette Trigger */}
        <button
          className="topbar-search-trigger"
          onClick={toggleCommandPalette}
          title="Open Command Palette (Ctrl+K or ⌘K)"
          aria-label="Open Command Palette"
        >
          <Search size={15} className="text-muted" />
          <span className="topbar-search-text">Search anything...</span>
          <kbd className="topbar-search-kbd">⌘K</kbd>
        </button>
      </div>

      <div className="topbar-actions">
        {/* Global Program Switcher */}
        {programList.length > 0 && (
          <div className="topbar-program-select-wrapper">
            <select
              className="topbar-program-select"
              value={activeProgramId}
              onChange={(e) =>
                setActiveProgramId(e.target.value ? Number(e.target.value) : '')
              }
              title="Filter entire platform by active Breeding Program"
              aria-label="Select active breeding program"
            >
              <option value="">All Programs</option>
              {programList.map((prog) => (
                <option key={prog.id} value={prog.id}>
                  {prog.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <OfflineSyncBadge />
        <NotificationCenter />

        <button
          className="btn btn-ghost btn-sm topbar-theme-btn flex items-center gap-1.5"
          onClick={toggleTheme}
          title={
            theme === 'sunlight'
              ? 'Switch to Dark Mode'
              : 'Switch to Outdoor Sunlight Mode'
          }
          aria-label={
            theme === 'sunlight'
              ? 'Switch to Dark Mode'
              : 'Switch to Outdoor Sunlight Mode'
          }
        >
          {theme === 'sunlight' ? (
            <>
              <Sun size={15} /> <span className="hide-mobile">Sunlight</span>
            </>
          ) : (
            <>
              <Moon size={15} /> <span className="hide-mobile">Dark</span>
            </>
          )}
        </button>

        {actions}
      </div>
    </div>
  )
}

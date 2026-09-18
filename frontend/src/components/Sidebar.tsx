import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  Sprout,
  Scissors,
  Package,
  LayoutGrid,
  ClipboardEdit,
  BarChart2,
  Dna,
  TrendingUp,
  Download,
  Shield,
  Settings,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  X,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import { offlineStorage } from '../services/offlineStorage'
import './Sidebar.css'

const OFFLINE_TRIAL_META_PREFIX = 'wbp-offline-trial-meta-'
const OFFLINE_DB_NAME = 'WheatBreedingPlatformDB'
const PWA_CACHE_NAME = 'wbp-pwa-v1'

const ICONS = {
  home: Home,
  sprout: Sprout,
  scissors: Scissors,
  package: Package,
  'layout-grid': LayoutGrid,
  'clipboard-edit': ClipboardEdit,
  'bar-chart-2': BarChart2,
  dna: Dna,
  'trending-up': TrendingUp,
  download: Download,
  shield: Shield,
  settings: Settings,
}

export interface NavItem {
  to: string
  label: string
  icon: keyof typeof ICONS
  roles: Set<string> | null
}

export interface NavGroup {
  id: string
  label: string | null
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'top',
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: 'home', roles: null },
    ],
  },
  {
    id: 'breeding',
    label: 'Breeding',
    items: [
      { to: '/germplasm', label: 'Germplasm', icon: 'sprout', roles: null },
      { to: '/crosses', label: 'Crossing Block', icon: 'scissors', roles: new Set(['admin', 'breeder']) },
      { to: '/seed-inventory', label: 'Seed Inventory', icon: 'package', roles: null },
    ],
  },
  {
    id: 'trials',
    label: 'Field Trials',
    items: [
      { to: '/trials', label: 'Trial Manager', icon: 'layout-grid', roles: null },
      { to: '/observations', label: 'Observation Entry', icon: 'clipboard-edit', roles: null },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    items: [
      { to: '/traits', label: 'Traits', icon: 'bar-chart-2', roles: new Set(['admin', 'breeder']) },
      { to: '/genomics', label: 'Genomics & MAS', icon: 'dna', roles: new Set(['admin', 'breeder']) },
      { to: '/analysis', label: 'Multi-Env Analysis', icon: 'trending-up', roles: new Set(['admin', 'breeder']) },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { to: '/export', label: 'Data Export', icon: 'download', roles: null },
      { to: '/audit', label: 'Audit Trail', icon: 'shield', roles: new Set(['admin', 'breeder']) },
      { to: '/setup', label: 'Setup', icon: 'settings', roles: new Set(['admin', 'breeder']) },
    ],
  },
]

export default function Sidebar() {
  const { username, role, clearAuth } = useAuthStore()
  const {
    theme,
    toggleTheme,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    collapsedNavGroups,
    toggleNavGroup,
  } = useUiStore()
  const location = useLocation()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await offlineStorage.clearQueuedObservations()

      Object.keys(localStorage)
        .filter((key) => key.startsWith(OFFLINE_TRIAL_META_PREFIX))
        .forEach((key) => localStorage.removeItem(key))

      sessionStorage.removeItem('wbp-auth')

      if (typeof indexedDB !== 'undefined') {
        indexedDB.deleteDatabase(OFFLINE_DB_NAME)
      }

      if (typeof caches !== 'undefined') {
        await caches.delete(PWA_CACHE_NAME)
      }
    } catch (e) {
      console.error('Failed to clear offline data on logout:', e)
    }

    clearAuth()
    navigate('/login')
  }

  function handleLinkClick() {
    if (window.innerWidth <= 900) {
      setMobileSidebarOpen(false)
    }
  }

  return (
    <>
      {mobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="flex items-center gap-3 flex-1">
            <span className="sidebar-logo">🌾</span>
            <div>
              <div className="sidebar-title">WheatBreed</div>
              <div className="sidebar-subtitle">Platform</div>
            </div>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={() => setMobileSidebarOpen(false)}
            title="Close menu"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.roles || item.roles.has(role ?? '')
            )

            if (visibleItems.length === 0) return null

            const isGroupActive = visibleItems.some((item) =>
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to)
            )

            // Never collapse if the group contains the currently active route
            const isCollapsed =
              group.label !== null &&
              collapsedNavGroups.includes(group.id) &&
              !isGroupActive

            return (
              <div key={group.id} className="sidebar-group" data-group-id={group.id}>
                {group.label && (
                  <button
                    type="button"
                    className="sidebar-group-header"
                    onClick={() => toggleNavGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    aria-label={`Toggle ${group.label} section`}
                  >
                    <span className="sidebar-group-label">{group.label}</span>
                    <span className="sidebar-group-toggle-icon">
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>
                )}

                {!isCollapsed && (
                  <div className="sidebar-group-items">
                    {visibleItems.map((item) => {
                      const IconComponent = ICONS[item.icon]
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/'}
                          onClick={handleLinkClick}
                          className={({ isActive }) =>
                            `sidebar-link ${isActive ? 'active' : ''}`
                          }
                        >
                          <span className="sidebar-link-icon">
                            <IconComponent size={17} />
                          </span>
                          <span className="sidebar-link-label">{item.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Theme & User Footer */}
        <div className="sidebar-footer">
          {/* Outdoor Sunlight Mode Switcher */}
          <button
            id="theme-toggle-btn"
            className={`btn btn-sm w-full theme-toggle-btn ${
              theme === 'sunlight' ? 'active-sunlight' : ''
            }`}
            onClick={toggleTheme}
            title="Toggle between Dark Mode and Outdoor High-Contrast Sunlight Mode"
          >
            {theme === 'sunlight' ? (
              <>
                <Sun size={15} /> Sunlight Mode
              </>
            ) : (
              <>
                <Moon size={15} /> Dark Mode
              </>
            )}
          </button>

          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {username?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-username">{username}</div>
              <div className="sidebar-role">{role}</div>
            </div>
          </div>
          <button
            className="sidebar-logout btn btn-ghost btn-sm flex items-center justify-center gap-2"
            onClick={handleLogout}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}

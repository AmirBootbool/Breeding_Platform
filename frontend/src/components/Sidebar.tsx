import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import { offlineStorage } from '../services/offlineStorage'
import './Sidebar.css'

const OFFLINE_TRIAL_META_PREFIX = 'wbp-offline-trial-meta-'
const OFFLINE_DB_NAME = 'WheatBreedingPlatformDB'
const PWA_CACHE_NAME = 'wbp-pwa-v1'

const NAV_ITEMS = [
  { to: '/',             label: 'Dashboard',        icon: '🏠',  roles: null },
  { to: '/germplasm',    label: 'Germplasm',         icon: '🌱',  roles: null },
  { to: '/crosses',      label: 'Crossing Block',    icon: '✂️',  roles: new Set(['admin', 'breeder']) },
  { to: '/seed-inventory',label: 'Seed Inventory',   icon: '📦',  roles: null },
  { to: '/trials',       label: 'Trials',            icon: '⊞',  roles: null },
  { to: '/observations', label: 'Observation Entry', icon: '📝', roles: null },
  { to: '/traits',       label: 'Traits',            icon: '📊',  roles: new Set(['admin', 'breeder']) },
  { to: '/genomics',     label: 'Genomics & MAS',    icon: '🧬',  roles: new Set(['admin', 'breeder']) },
  { to: '/export',       label: 'Data Export',       icon: '⬇️',  roles: null },
  { to: '/analysis',     label: 'Multi-Env Analysis',icon: '📈',  roles: new Set(['admin', 'breeder']) },
  { to: '/audit',        label: 'Audit Trail',       icon: '🛡️',  roles: new Set(['admin', 'breeder']) },
  { to: '/setup',        label: 'Setup',             icon: '⚙️',  roles: new Set(['admin', 'breeder']) },
]

export default function Sidebar() {
  const { username, role, clearAuth } = useAuthStore()
  const { theme, toggleTheme, mobileSidebarOpen, setMobileSidebarOpen } = useUiStore()
  const navigate = useNavigate()

  async function handleLogout() {
    // Clearing only the auth token leaves cached trial data, the pending
    // observation queue, and the PWA cache behind for the next person to
    // log in on this device - clear the offline data too, not just auth.
    try {
      await offlineStorage.clearQueuedObservations()

      // Clear offline trial metadata from localStorage.
      Object.keys(localStorage)
        .filter(key => key.startsWith(OFFLINE_TRIAL_META_PREFIX))
        .forEach(key => localStorage.removeItem(key))

      // Clear auth token from sessionStorage (H-1: token is stored in sessionStorage).
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
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter(item => !item.roles || item.roles.has(role ?? '')).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={handleLinkClick}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span className="sidebar-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Theme & User Footer */}
        <div className="sidebar-footer">
          {/* Outdoor Sunlight Mode Switcher */}
          <button
            id="theme-toggle-btn"
            className={`btn btn-sm w-full theme-toggle-btn ${theme === 'sunlight' ? 'active-sunlight' : ''}`}
            onClick={toggleTheme}
            title="Toggle between Dark Mode and Outdoor High-Contrast Sunlight Mode"
          >
            {theme === 'sunlight' ? '☀️ Sunlight Mode' : '🌙 Dark Mode'}
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
          <button className="sidebar-logout btn btn-ghost btn-sm" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}

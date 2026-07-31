import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/',             label: 'Dashboard',        icon: '⊞',  roles: null },
  { to: '/germplasm',    label: 'Germplasm',         icon: '🌾',  roles: null },
  { to: '/trials',       label: 'Trials',            icon: '🧪',  roles: null },
  { to: '/observations', label: 'Observation Entry', icon: '✏️', roles: null },
  { to: '/export',       label: 'Data Export',       icon: '⬇',  roles: null },
  { to: '/setup',        label: 'Setup',             icon: '⚙',  roles: new Set(['admin', 'breeder']) },
]

export default function Sidebar() {
  const { username, role, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-brand">
        <span className="sidebar-logo">🌾</span>
        <div>
          <div className="sidebar-title">WheatBreed</div>
          <div className="sidebar-subtitle">Platform</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.filter(item => !item.roles || item.roles.has(role ?? '')).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span className="sidebar-link-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer / user info */}
      <div className="sidebar-footer">
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
  )
}

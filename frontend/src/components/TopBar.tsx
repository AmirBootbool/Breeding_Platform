import { useUiStore } from '../store/uiStore'
import './TopBar.css'

interface TopBarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  const { toggleMobileSidebar, theme, toggleTheme } = useUiStore()

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button
          className="topbar-menu-btn"
          onClick={toggleMobileSidebar}
          title="Open navigation menu"
        >
          ☰
        </button>
        <div className="topbar-text">
          <h1>{title}</h1>
          {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
        </div>
      </div>
      <div className="topbar-actions">
        <button
          className="btn btn-ghost btn-sm topbar-theme-btn"
          onClick={toggleTheme}
          title={theme === 'sunlight' ? 'Switch to Dark Mode' : 'Switch to Outdoor Sunlight Mode'}
        >
          {theme === 'sunlight' ? '☀️ Sunlight' : '🌙 Dark'}
        </button>
        {actions}
      </div>
    </div>
  )
}

import './TopBar.css'

interface TopBarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar-text">
        <h1>{title}</h1>
        {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </div>
  )
}

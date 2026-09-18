import { Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface BreadcrumbsProps {
  crumbs: BreadcrumbItem[]
  className?: string
}

export default function Breadcrumbs({ crumbs, className = '' }: BreadcrumbsProps) {
  if (!crumbs || crumbs.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-xs text-muted ${className}`}>
      <Link
        to="/"
        className="flex items-center gap-1 hover:text-primary transition-colors text-muted"
        title="Dashboard"
      >
        <Home size={13} />
      </Link>

      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1

        return (
          <div key={idx} className="flex items-center gap-1.5">
            <ChevronRight size={12} className="text-muted opacity-60" />
            {crumb.to && !isLast ? (
              <Link
                to={crumb.to}
                className="hover:text-primary transition-colors text-muted"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-primary font-medium' : 'text-muted'}>
                {crumb.label}
              </span>
            )}
          </div>
        )
      })}
    </nav>
  )
}

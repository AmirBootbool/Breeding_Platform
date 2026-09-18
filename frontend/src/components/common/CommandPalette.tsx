import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
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
  PlusCircle,
  Upload,
  ArrowRight,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useUiStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { germplasm, trials, crossingBlocks, CrossingBlock } from '../../api/client'
import { NAV_GROUPS } from '../Sidebar'
import './CommandPalette.css'

export interface CommandItem {
  id: string
  group: 'Pages' | 'Records' | 'Actions'
  label: string
  sublabel?: string
  icon?: LucideIcon
  onSelect: () => void
}

const PAGE_ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/germplasm': Sprout,
  '/crosses': Scissors,
  '/seed-inventory': Package,
  '/trials': LayoutGrid,
  '/observations': ClipboardEdit,
  '/traits': BarChart2,
  '/genomics': Dna,
  '/analysis': TrendingUp,
  '/export': Download,
  '/audit': Shield,
  '/setup': Settings,
}

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore()
  const { role } = useAuthStore()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isSearchingRecords, setIsSearchingRecords] = useState(false)
  const [recordResults, setRecordResults] = useState<CommandItem[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Debounce query for record search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  // Focus input on open and listen for Escape key globally
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setDebouncedQuery('')
      setSelectedIndex(0)
      setRecordResults([])
      setTimeout(() => inputRef.current?.focus(), 50)

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          setCommandPaletteOpen(false)
        }
      }

      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [commandPaletteOpen, setCommandPaletteOpen])

  // Fetch records when debouncedQuery >= 2 chars
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setRecordResults([])
      setIsSearchingRecords(false)
      return
    }

    let isMounted = true
    setIsSearchingRecords(true)

    const fetchRecords = async () => {
      try {
        const [germRes, trialRes, crossRes] = await Promise.allSettled([
          germplasm.list(`?search=${encodeURIComponent(debouncedQuery)}&page_size=5`),
          trials.list(`?search=${encodeURIComponent(debouncedQuery)}&page_size=5`),
          crossingBlocks.list(`&search=${encodeURIComponent(debouncedQuery)}`),
        ])

        if (!isMounted) return

        const items: CommandItem[] = []

        if (germRes.status === 'fulfilled' && germRes.value.results) {
          germRes.value.results.forEach((g) => {
            items.push({
              id: `germplasm-${g.id}`,
              group: 'Records',
              label: g.name,
              sublabel: `Germplasm • ${g.germplasm_db_id}${g.pedigree_string ? ` • ${g.pedigree_string}` : ''}`,
              icon: Sprout,
              onSelect: () => {
                navigate('/germplasm')
                setCommandPaletteOpen(false)
              },
            })
          })
        }

        if (trialRes.status === 'fulfilled' && trialRes.value.results) {
          trialRes.value.results.forEach((t) => {
            items.push({
              id: `trial-${t.id}`,
              group: 'Records',
              label: t.name,
              sublabel: `Trial • Code: ${t.trial_code || 'N/A'} • ${t.design_type}`,
              icon: LayoutGrid,
              onSelect: () => {
                navigate('/trials')
                setCommandPaletteOpen(false)
              },
            })
          })
        }

        if (crossRes.status === 'fulfilled' && crossRes.value.results) {
          crossRes.value.results.forEach((c: CrossingBlock) => {
            items.push({
              id: `cross-block-${c.id}`,
              group: 'Records',
              label: c.name,
              sublabel: `Crossing Block • ${c.cross_count} crosses • ${c.program_name || 'Program'}`,
              icon: Scissors,
              onSelect: () => {
                navigate('/crosses')
                setCommandPaletteOpen(false)
              },
            })
          })
        }

        setRecordResults(items)
      } catch {
        if (isMounted) setRecordResults([])
      } finally {
        if (isMounted) setIsSearchingRecords(false)
      }
    }

    fetchRecords()

  }, [debouncedQuery, navigate, setCommandPaletteOpen])

  // Static Pages Commands
  const pageCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []
    NAV_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        if (!item.roles || item.roles.has(role ?? '')) {
          const Icon = PAGE_ICONS[item.to] || Home
          items.push({
            id: `page-${item.to}`,
            group: 'Pages',
            label: item.label,
            sublabel: `Go to ${item.label}`,
            icon: Icon,
            onSelect: () => {
              navigate(item.to)
              setCommandPaletteOpen(false)
            },
          })
        }
      })
    })
    return items
  }, [role, navigate, setCommandPaletteOpen])

  // Static Action Commands
  const actionCommands = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [
      {
        id: 'action-new-observation',
        group: 'Actions',
        label: 'New Observation Entry',
        sublabel: 'Record field observation data',
        icon: PlusCircle,
        onSelect: () => {
          navigate('/observations')
          setCommandPaletteOpen(false)
        },
      },
    ]

    if (role === 'admin' || role === 'breeder') {
      actions.push(
        {
          id: 'action-new-cross',
          group: 'Actions',
          label: 'Plan New Cross',
          sublabel: 'Open crossing block manager',
          icon: Scissors,
          onSelect: () => {
            navigate('/crosses')
            setCommandPaletteOpen(false)
          },
        },
        {
          id: 'action-new-trial',
          group: 'Actions',
          label: 'Create Field Trial',
          sublabel: 'Design and randomize a new trial layout',
          icon: LayoutGrid,
          onSelect: () => {
            navigate('/trials')
            setCommandPaletteOpen(false)
          },
        },
        {
          id: 'action-import-fieldbook',
          group: 'Actions',
          label: 'Import Field Book / CSV',
          sublabel: 'Import trial plots and observations',
          icon: Upload,
          onSelect: () => {
            navigate('/trials')
            setCommandPaletteOpen(false)
          },
        }
      )
    }

    return actions
  }, [role, navigate, setCommandPaletteOpen])

  // Filtered list
  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) {
      return [...actionCommands, ...pageCommands]
    }

    const matchedPages = pageCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.sublabel && c.sublabel.toLowerCase().includes(q))
    )

    const matchedActions = actionCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.sublabel && c.sublabel.toLowerCase().includes(q))
    )

    return [...matchedActions, ...matchedPages, ...recordResults]
  }, [query, actionCommands, pageCommands, recordResults])

  // Reset selectedIndex if out of bounds
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1))
    }
  }, [filteredCommands.length, selectedIndex])

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        prev <= 0 ? Math.max(0, filteredCommands.length - 1) : prev - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].onSelect()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setCommandPaletteOpen(false)
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector<HTMLElement>('.cmd-item.selected')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!commandPaletteOpen) return null

  return (
    <div
      className="cmd-palette-backdrop"
      onClick={() => setCommandPaletteOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="cmd-palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search header */}
        <div className="cmd-palette-search-bar">
          <Search size={18} className="cmd-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder="Search pages, trials, germplasm, actions... (↑↓ to move, ↵ to select, esc)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Command query"
          />
          {query && (
            <button
              className="cmd-clear-btn"
              onClick={() => setQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="cmd-palette-results">
          {isSearchingRecords && query.length >= 2 && (
            <div className="cmd-searching-indicator">
              <span>Searching records...</span>
            </div>
          )}

          {filteredCommands.length === 0 && !isSearchingRecords ? (
            <div className="cmd-empty-state">
              <p>No results found for &ldquo;{query}&rdquo;</p>
              <span className="text-muted text-xs">
                Try searching for a page name, accession code, or trial code.
              </span>
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex
              const Icon = cmd.icon || ArrowRight

              return (
                <div
                  key={cmd.id}
                  className={`cmd-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => cmd.onSelect()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="cmd-item-icon">
                    <Icon size={16} />
                  </div>
                  <div className="cmd-item-content">
                    <div className="cmd-item-label">{cmd.label}</div>
                    {cmd.sublabel && (
                      <div className="cmd-item-sublabel">{cmd.sublabel}</div>
                    )}
                  </div>
                  <span className="cmd-item-group-badge">{cmd.group}</span>
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="cmd-palette-footer">
          <div className="cmd-shortcut-hint">
            <kbd>↑</kbd> <kbd>↓</kbd> Navigate
          </div>
          <div className="cmd-shortcut-hint">
            <kbd>↵</kbd> Select
          </div>
          <div className="cmd-shortcut-hint">
            <kbd>esc</kbd> Close
          </div>
        </div>
      </div>
    </div>
  )
}

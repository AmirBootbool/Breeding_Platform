import { useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Download,
  Plus,
  Trash2,
  Scale
} from 'lucide-react'
import { germplasm, Germplasm } from '../api/client'
import TopBar from '../components/TopBar'

function CrossTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    biparental: 'badge-green',
    backcross: 'badge-amber',
    doubled_haploid: 'badge-blue',
    self: 'badge-gray',
    other: 'badge-gray',
    unknown: 'badge-gray',
  }
  return <span className={`badge ${map[type] ?? 'badge-gray'}`}>{type}</span>
}

const GEN_LABELS: Record<number, string> = {
  0: 'P (Parent)',
  1: 'F1',
  2: 'F2',
  3: 'F3',
  4: 'F4',
  5: 'F5',
  6: 'F6',
  7: 'F7',
  8: 'F8 (Line)',
}

const MAX_COMPARE_LIMIT = 20

export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams()

  const idsParam = searchParams.get('ids') || ''
  const selectedIds = useMemo(() => {
    return idsParam
      .split(',')
      .map(id => Number(id.trim()))
      .filter(id => !isNaN(id) && id > 0)
      .slice(0, MAX_COMPARE_LIMIT)
  }, [idsParam])

  const [highlightDiffs, setHighlightDiffs] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddMenu, setShowAddMenu] = useState(false)

  // Fetch all germplasm to populate data and search dropdown
  const { data: allData, isLoading } = useQuery({
    queryKey: ['germplasm-all'],
    queryFn: () => germplasm.listAll(),
  })

  const allGermplasm: Germplasm[] = allData?.results ?? []

  const germplasmMap = useMemo(() => {
    const map = new Map<number, Germplasm>()
    allGermplasm.forEach(g => map.set(g.id, g))
    return map
  }, [allGermplasm])

  const comparedList = useMemo(() => {
    return selectedIds.map(id => germplasmMap.get(id)).filter(Boolean) as Germplasm[]
  }, [selectedIds, germplasmMap])

  const availableToAdd = useMemo(() => {
    return allGermplasm.filter(g =>
      !selectedIds.includes(g.id) &&
      (g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
       g.germplasm_db_id.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 15)
  }, [allGermplasm, selectedIds, searchQuery])

  const handleRemoveId = (idToRemove: number) => {
    const nextIds = selectedIds.filter(id => id !== idToRemove)
    if (nextIds.length === 0) {
      setSearchParams({})
    } else {
      setSearchParams({ ids: nextIds.join(',') })
    }
  }

  const handleAddId = (idToAdd: number) => {
    if (selectedIds.length >= MAX_COMPARE_LIMIT) return
    if (!selectedIds.includes(idToAdd)) {
      const nextIds = [...selectedIds, idToAdd]
      setSearchParams({ ids: nextIds.join(',') })
    }
    setSearchQuery('')
    setShowAddMenu(false)
  }

  const handleExportCSV = () => {
    if (comparedList.length === 0) return
    const headers = ['Attribute', ...comparedList.map(g => `"${g.name} (${g.germplasm_db_id})"`)]
    const rows = [
      ['ID', ...comparedList.map(g => g.id)],
      ['DB ID', ...comparedList.map(g => `"${g.germplasm_db_id}"`)],
      ['Name', ...comparedList.map(g => `"${g.name}"`)],
      ['Check Line', ...comparedList.map(g => g.is_check ? 'YES' : 'NO')],
      ['Program', ...comparedList.map(g => `"${g.program_name}"`)],
      ['Generation', ...comparedList.map(g => `"${GEN_LABELS[g.generation] ?? `F${g.generation}`}"`)],
      ['Cross Type', ...comparedList.map(g => g.cross_type)],
      ['Female Parent', ...comparedList.map(g => `"${g.parent_female_name || ''}"`)],
      ['Male Parent', ...comparedList.map(g => `"${g.parent_male_name || ''}"`)],
      ['Pedigree String', ...comparedList.map(g => `"${g.pedigree_string || ''}"`)],
      ['Tags', ...comparedList.map(g => `"${(g.tags || []).join(', ')}"`)],
      ['Notes', ...comparedList.map(g => `"${g.notes || ''}"`)],
    ]

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `germplasm_comparison_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Row definition helper to check difference
  const checkDiff = (getter: (g: Germplasm) => any) => {
    if (comparedList.length <= 1) return false
    const first = getter(comparedList[0])
    return comparedList.some(g => getter(g) !== first)
  }

  const comparisonAttributes = [
    {
      label: 'Germplasm DB ID',
      isDiff: checkDiff(g => g.germplasm_db_id),
      render: (g: Germplasm) => <span className="font-mono text-xs text-muted">{g.germplasm_db_id}</span>,
    },
    {
      label: 'Check Status',
      isDiff: checkDiff(g => g.is_check),
      render: (g: Germplasm) => g.is_check ? (
        <span className="badge badge-amber">⭐ Check Line</span>
      ) : (
        <span className="badge badge-gray">Candidate</span>
      ),
    },
    {
      label: 'Breeding Program',
      isDiff: checkDiff(g => g.program_name),
      render: (g: Germplasm) => <span>{g.program_name}</span>,
    },
    {
      label: 'Generation',
      isDiff: checkDiff(g => g.generation),
      render: (g: Germplasm) => (
        <span className="badge badge-blue font-semibold">{GEN_LABELS[g.generation] ?? `F${g.generation}`}</span>
      ),
    },
    {
      label: 'Cross Type',
      isDiff: checkDiff(g => g.cross_type),
      render: (g: Germplasm) => <CrossTypeBadge type={g.cross_type} />,
    },
    {
      label: 'Female Parent (♀)',
      isDiff: checkDiff(g => g.parent_female_name || ''),
      render: (g: Germplasm) => g.parent_female_name ? (
        <span className="font-medium text-purple">{g.parent_female_name}</span>
      ) : (
        <span className="text-muted">—</span>
      ),
    },
    {
      label: 'Male Parent (♂)',
      isDiff: checkDiff(g => g.parent_male_name || ''),
      render: (g: Germplasm) => g.parent_male_name ? (
        <span className="font-medium text-blue">{g.parent_male_name}</span>
      ) : (
        <span className="text-muted">—</span>
      ),
    },
    {
      label: 'Pedigree String',
      isDiff: checkDiff(g => g.pedigree_string || ''),
      render: (g: Germplasm) => (
        <code className="font-mono text-xs" style={{ color: 'var(--brand-300)', wordBreak: 'break-all' }}>
          {g.pedigree_string || '—'}
        </code>
      ),
    },
    {
      label: 'Tags',
      isDiff: checkDiff(g => (g.tags || []).sort().join(',')),
      render: (g: Germplasm) => (
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          {(g.tags || []).length > 0 ? (
            g.tags.map(t => <span key={t} className="badge badge-gray text-xs">{t}</span>)
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
      ),
    },
    {
      label: 'Year Developed',
      isDiff: checkDiff(g => g.year_developed ?? ''),
      render: (g: Germplasm) => <span>{g.year_developed || '—'}</span>,
    },
    {
      label: 'Notes',
      isDiff: checkDiff(g => g.notes || ''),
      render: (g: Germplasm) => (
        <span className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
          {g.notes || '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="compare-page">
      <TopBar
        title="Side-by-Side Germplasm Comparison"
        subtitle={`Comparing ${comparedList.length} of max ${MAX_COMPARE_LIMIT} accessions`}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/germplasm" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <ArrowLeft size={14} /> Back to Germplasm
            </Link>
            <button
              id="compare-export-csv-btn"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={handleExportCSV}
              disabled={comparedList.length === 0}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        }
      />

      {/* Control Bar */}
      <div className="card mb-4" style={{ padding: 'var(--space-3)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none font-medium">
              <input
                id="highlight-diffs-checkbox"
                type="checkbox"
                checked={highlightDiffs}
                onChange={e => setHighlightDiffs(e.target.checked)}
              />
              <span>Highlight differences</span>
            </label>
            <span className="badge badge-gray text-xs">
              {comparedList.length} / {MAX_COMPARE_LIMIT} lines selected
            </span>
          </div>

          <div className="flex items-center gap-2 relative">
            <div className="relative">
              <button
                id="add-accession-compare-btn"
                className="btn btn-primary btn-sm flex items-center gap-1.5"
                disabled={selectedIds.length >= MAX_COMPARE_LIMIT}
                onClick={() => setShowAddMenu(prev => !prev)}
              >
                <Plus size={14} /> Add Line ({selectedIds.length}/{MAX_COMPARE_LIMIT})
              </button>

              {showAddMenu && (
                <div
                  className="card"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    zIndex: 200,
                    width: '320px',
                    padding: 'var(--space-3)',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <div className="form-group mb-2">
                    <input
                      id="search-add-line-input"
                      type="text"
                      className="form-input text-xs"
                      placeholder="Search accession name or ID..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col gap-1" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {availableToAdd.length > 0 ? (
                      availableToAdd.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-1.5 rounded hover:bg-hover cursor-pointer text-xs"
                          onClick={() => handleAddId(item.id)}
                        >
                          <div>
                            <span className="font-semibold block">{item.name}</span>
                            <span className="text-muted font-mono" style={{ fontSize: '0.7rem' }}>
                              {item.germplasm_db_id} · {item.program_name}
                            </span>
                          </div>
                          <Plus size={14} className="text-brand" />
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted p-2">No matching accessions found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 flex justify-center items-center">
          <div className="spinner" />
          <span className="ml-3 text-muted">Loading accessions...</span>
        </div>
      ) : comparedList.length === 0 ? (
        <div className="card empty-state text-center p-8">
          <Scale size={48} className="text-muted mb-3 mx-auto" />
          <h3 className="text-lg font-semibold mb-1">No Accessions Selected for Comparison</h3>
          <p className="text-muted text-sm mb-4 max-w-md mx-auto">
            Select up to 20 accessions from the Germplasm Browser or use the button above to add lines to compare.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/germplasm" className="btn btn-primary">
              Go to Germplasm Browser
            </Link>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            overflowX: 'auto',
            padding: 0,
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <table
            className="data-table"
            style={{
              width: '100%',
              minWidth: `${Math.max(600, comparedList.length * 220 + 180)}px`,
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ background: 'var(--bg-card)' }}>
                <th
                  style={{
                    width: '180px',
                    position: 'sticky',
                    left: 0,
                    zIndex: 5,
                    background: 'var(--bg-card)',
                    borderRight: '2px solid var(--border-default)',
                    padding: 'var(--space-3)',
                  }}
                >
                  <span className="font-semibold text-xs uppercase tracking-wider text-muted">Attribute</span>
                </th>
                {comparedList.map(g => (
                  <th
                    key={g.id}
                    style={{
                      width: '220px',
                      padding: 'var(--space-3)',
                      textAlign: 'left',
                      verticalAlign: 'top',
                      borderRight: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-brand">{g.name}</div>
                        <div className="text-xs font-mono text-muted">{g.germplasm_db_id}</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm p-1 text-muted hover:text-danger"
                        title="Remove from comparison"
                        aria-label={`Remove ${g.name} from comparison`}
                        onClick={() => handleRemoveId(g.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonAttributes.map((attr, idx) => {
                const isDifferent = highlightDiffs && attr.isDiff
                return (
                  <tr
                    key={attr.label}
                    style={{
                      background: isDifferent ? 'var(--brand-glow)' : idx % 2 === 0 ? 'var(--bg-elevated)' : 'var(--bg-card)',
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 4,
                        background: isDifferent ? 'var(--bg-hover)' : idx % 2 === 0 ? 'var(--bg-elevated)' : 'var(--bg-card)',
                        borderRight: '2px solid var(--border-default)',
                        padding: 'var(--space-2) var(--space-3)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{attr.label}</span>
                        {isDifferent && (
                          <span className="badge badge-amber text-xs" style={{ fontSize: '0.65rem', padding: '0 4px' }}>
                            Diff
                          </span>
                        )}
                      </div>
                    </td>
                    {comparedList.map(g => (
                      <td
                        key={g.id}
                        style={{
                          padding: 'var(--space-2) var(--space-3)',
                          borderRight: '1px solid var(--border-subtle)',
                          fontSize: '0.85rem',
                        }}
                      >
                        {attr.render(g)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

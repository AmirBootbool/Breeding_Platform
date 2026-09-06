import React, { useState, useMemo } from 'react'

export interface Column<T> {
  key: string
  header: React.ReactNode
  accessor?: (item: T) => any
  render?: (item: T, index: number) => React.ReactNode
  sortable?: boolean
  searchable?: boolean
  width?: string | number
  align?: 'left' | 'center' | 'right'
  className?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  idAccessor?: (item: T) => string | number
  keyExtractor?: (item: T, index: number) => string | number
  selectable?: boolean
  selectedIds?: (string | number)[]
  onSelectionChange?: (selectedIds: (string | number)[], selectedItems: T[]) => void
  onRowClick?: (item: T, index: number) => void
  rowClassName?: (item: T, index: number) => string
  isLoading?: boolean
  emptyMessage?: string
  searchPlaceholderPrefix?: string
  stickyHeader?: boolean
  maxHeight?: string | number
  pagination?: boolean
  defaultPageSize?: number
  pageSizeOptions?: number[]
  exportable?: boolean
  exportFileName?: string
  className?: string
  extraActions?: React.ReactNode
}

type SortDirection = 'asc' | 'desc' | null

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  idAccessor = (item: T) => item.id ?? item.uuid,
  keyExtractor,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  onRowClick,
  rowClassName,
  isLoading = false,
  emptyMessage = 'No data available',
  stickyHeader = false,
  maxHeight,
  pagination = false,
  defaultPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  exportable = false,
  exportFileName = 'export.csv',
  className = '',
  extraActions
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  // Get raw or accessor value for a cell
  const getItemValue = (item: T, col: Column<T>) => {
    if (col.accessor) return col.accessor(item)
    return item[col.key]
  }

  // Handle Sort Toggle
  const handleSort = (colKey: string, isSortable?: boolean) => {
    if (isSortable === false) return
    if (sortKey === colKey) {
      if (sortDirection === 'asc') setSortDirection('desc')
      else if (sortDirection === 'desc') {
        setSortKey(null)
        setSortDirection(null)
      }
    } else {
      setSortKey(colKey)
      setSortDirection('asc')
    }
  }

  // Handle Filter Change
  const handleFilterChange = (colKey: string, val: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [colKey]: val
    }))
    setCurrentPage(1)
  }

  // Clear all filters
  const handleClearFilters = () => {
    setColumnFilters({})
    setCurrentPage(1)
  }

  const hasActiveFilters = Object.values(columnFilters).some(v => v.trim().length > 0)

  // Filter and Sort Data
  const filteredSortedData = useMemo(() => {
    let result = [...data]

    // Apply per-column search filters
    Object.entries(columnFilters).forEach(([colKey, filterVal]) => {
      const search = filterVal.trim().toLowerCase()
      if (!search) return

      const col = columns.find(c => c.key === colKey)
      if (!col) return

      result = result.filter(item => {
        const val = getItemValue(item, col)
        if (val === null || val === undefined) return false
        return String(val).toLowerCase().includes(search)
      })
    })

    // Apply Sorting
    if (sortKey && sortDirection) {
      const col = columns.find(c => c.key === sortKey)
      if (col) {
        result.sort((a, b) => {
          const valA = getItemValue(a, col)
          const valB = getItemValue(b, col)

          if (valA === valB) return 0
          if (valA === null || valA === undefined) return 1
          if (valB === null || valB === undefined) return -1

          if (typeof valA === 'number' && typeof valB === 'number') {
            return sortDirection === 'asc' ? valA - valB : valB - valA
          }

          // Date check
          const dateA = Date.parse(valA)
          const dateB = Date.parse(valB)
          if (!isNaN(dateA) && !isNaN(dateB) && typeof valA === 'string' && valA.includes('-')) {
            return sortDirection === 'asc' ? dateA - dateB : dateB - dateA
          }

          const strA = String(valA).toLowerCase()
          const strB = String(valB).toLowerCase()
          return sortDirection === 'asc'
            ? strA.localeCompare(strB)
            : strB.localeCompare(strA)
        })
      }
    }

    return result
  }, [data, columnFilters, sortKey, sortDirection, columns])

  // Pagination slice
  const totalItems = filteredSortedData.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const paginatedData = useMemo(() => {
    if (!pagination) return filteredSortedData
    const start = (currentPage - 1) * pageSize
    return filteredSortedData.slice(start, start + pageSize)
  }, [filteredSortedData, pagination, currentPage, pageSize])

  // Selection handlers
  const isAllSelected = useMemo(() => {
    if (filteredSortedData.length === 0) return false
    return filteredSortedData.every(item => selectedIds.includes(idAccessor(item)))
  }, [filteredSortedData, selectedIds, idAccessor])

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelectionChange) return
    if (e.target.checked) {
      const allIds = Array.from(new Set([...selectedIds, ...filteredSortedData.map(idAccessor)]))
      const allItems = data.filter(item => allIds.includes(idAccessor(item)))
      onSelectionChange(allIds, allItems)
    } else {
      const remainingIds = selectedIds.filter(id => !filteredSortedData.some(item => idAccessor(item) === id))
      const remainingItems = data.filter(item => remainingIds.includes(idAccessor(item)))
      onSelectionChange(remainingIds, remainingItems)
    }
  }

  const handleRowSelect = (item: T, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation()
    if (!onSelectionChange) return
    const id = idAccessor(item)
    const exists = selectedIds.includes(id)
    const nextIds = exists ? selectedIds.filter(i => i !== id) : [...selectedIds, id]
    const nextItems = data.filter(d => nextIds.includes(idAccessor(d)))
    onSelectionChange(nextIds, nextItems)
  }

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredSortedData.length === 0) return
    const headers = columns.map(c => typeof c.header === 'string' ? `"${c.header}"` : `"${c.key}"`).join(',')
    const rows = filteredSortedData.map(item => {
      return columns.map(c => {
        const val = getItemValue(item, c)
        if (val === null || val === undefined) return '""'
        const clean = String(val).replace(/"/g, '""')
        return `"${clean}"`
      }).join(',')
    })
    const csvContent = [headers, ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', exportFileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`data-table-wrapper ${className}`} style={{ width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Top Bar (Actions, Counts, Filter reset) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span className="text-muted">
            Showing <strong className="text-primary">{filteredSortedData.length}</strong> of {data.length} records
          </span>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="btn btn-secondary btn-sm"
              style={{ padding: '2px 8px', fontSize: '0.75rem', height: 'auto' }}
              title="Reset all search filters"
            >
              ✕ Clear Filters
            </button>
          )}
          {selectable && selectedIds.length > 0 && (
            <span className="badge badge-green">
              {selectedIds.length} selected
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {extraActions}
          {exportable && (
            <button
              onClick={handleExportCSV}
              className="btn btn-secondary btn-sm"
              disabled={filteredSortedData.length === 0}
              style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              📥 Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div
        className="table-container"
        style={{
          maxHeight: maxHeight || (stickyHeader ? '65vh' : undefined),
          overflowY: maxHeight || stickyHeader ? 'auto' : 'visible',
          overflowX: 'auto',
          width: '100%',
          position: 'relative',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-md)',
          background: 'var(--bg-elevated)'
        }}
      >
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-elevated)' } : undefined}>
            {/* Header Titles & Sort */}
            <tr>
              {selectable && (
                <th style={{ width: '40px', textAlign: 'center', padding: 'var(--space-2)' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    title="Select / Deselect all"
                  />
                </th>
              )}
              {columns.map(col => {
                const isSorted = sortKey === col.key
                const isSortable = col.sortable !== false
                return (
                  <th
                    key={col.key}
                    style={{
                      width: col.width,
                      textAlign: col.align || 'left',
                      cursor: isSortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      padding: 'var(--space-2) var(--space-3)',
                      whiteSpace: 'nowrap'
                    }}
                    onClick={() => handleSort(col.key, col.sortable)}
                    className={col.className}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                      <span>{col.header}</span>
                      {isSortable && (
                        <span style={{ fontSize: '0.7rem', color: isSorted ? 'var(--brand-300)' : 'var(--text-muted)', opacity: isSorted ? 1 : 0.4 }}>
                          {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>

            {/* Per-Column Search Row */}
            <tr style={{ background: 'var(--bg-card)', borderBottom: '2px solid var(--border-subtle)' }}>
              {selectable && <th style={{ padding: '4px' }}></th>}
              {columns.map(col => {
                const isSearchable = col.searchable !== false
                return (
                  <th key={`search-${col.key}`} style={{ padding: '4px 6px', textAlign: col.align || 'left' }}>
                    {isSearchable ? (
                      <input
                        type="text"
                        className="form-input"
                        style={{
                          width: '100%',
                          minWidth: '60px',
                          padding: '3px 6px',
                          fontSize: '0.75rem',
                          height: '24px',
                          borderRadius: 'var(--r-sm)',
                          background: 'var(--bg-input)',
                          border: columnFilters[col.key] ? '1px solid var(--brand-400)' : '1px solid var(--border-subtle)'
                        }}
                        placeholder="Search..."
                        value={columnFilters[col.key] || ''}
                        onChange={e => handleFilterChange(col.key, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : null}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <div className="spinner" style={{ width: 24, height: 24 }} />
                    <span className="text-muted text-sm">Loading records...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}
                >
                  {hasActiveFilters ? (
                    <div>
                      <p style={{ margin: '0 0 var(--space-2) 0' }}>No records match the active search filters.</p>
                      <button onClick={handleClearFilters} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                        Clear Filters
                      </button>
                    </div>
                  ) : (
                    emptyMessage
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, idx) => {
                const itemId = idAccessor(item)
                const isSelected = selectedIds.includes(itemId)
                const customRowClass = rowClassName ? rowClassName(item, idx) : ''
                const key = keyExtractor ? keyExtractor(item, idx) : (itemId ?? idx)

                return (
                  <tr
                    key={key}
                    className={`${isSelected ? 'selected-row' : ''} ${customRowClass}`}
                    onClick={() => onRowClick && onRowClick(item, idx)}
                    style={{
                      cursor: onRowClick ? 'pointer' : 'default',
                      transition: 'background var(--transition-fast)'
                    }}
                  >
                    {selectable && (
                      <td
                        style={{ textAlign: 'center', padding: 'var(--space-2)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => handleRowSelect(item, e)}
                        />
                      </td>
                    )}
                    {columns.map(col => {
                      const val = getItemValue(item, col)
                      return (
                        <td
                          key={col.key}
                          style={{
                            textAlign: col.align || 'left',
                            padding: 'var(--space-2) var(--space-3)'
                          }}
                          className={col.className}
                        >
                          {col.render ? col.render(item, idx) : (val !== null && val !== undefined ? String(val) : '—')}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {pagination && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>Rows per page:</span>
            <select
              className="form-input"
              style={{ width: 70, padding: '2px 6px', height: '26px', fontSize: '0.8rem' }}
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span className="text-muted">
              Page {currentPage} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(1)}
                style={{ padding: '2px 6px', height: '26px' }}
                title="First Page"
              >
                «
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{ padding: '2px 8px', height: '26px' }}
                title="Previous Page"
              >
                ‹ Prev
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '2px 8px', height: '26px' }}
                title="Next Page"
              >
                Next ›
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                style={{ padding: '2px 6px', height: '26px' }}
                title="Last Page"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

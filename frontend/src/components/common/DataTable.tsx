import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  SlidersHorizontal,
  Bookmark,
  Trash2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react'
import { usePreferencesStore, ColumnConfig, SavedView } from '../../store/preferencesStore'
import DetailDrawer from './DetailDrawer'

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
  bulkActions?: (selectedIds: (string | number)[], selectedItems: T[]) => React.ReactNode
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
  tableId?: string
  enableColumnControl?: boolean
  enableSavedViews?: boolean
  detailPanel?: (item: T) => React.ReactNode
}

type SortDirection = 'asc' | 'desc' | null

export function DataTable<T extends Record<string, any>>({
  columns: initialColumns,
  data,
  idAccessor = (item: T) => item.id ?? item.uuid,
  keyExtractor,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  bulkActions,
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
  extraActions,
  tableId,
  enableColumnControl = false,
  enableSavedViews = false,
  detailPanel,
}: DataTableProps<T>) {
  const {
    tableDensity,
    columnConfig,
    savedViews,
    set: setPreference,
  } = usePreferencesStore()

  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [activeDrawerItem, setActiveDrawerItem] = useState<T | null>(null)

  // Column control popover & Saved views popover state
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [showViewsMenu, setShowViewsMenu] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const [newViewIsDefault, setNewViewIsDefault] = useState(false)

  const columnMenuRef = useRef<HTMLDivElement>(null)
  const viewsMenuRef = useRef<HTMLDivElement>(null)

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false)
      }
      if (viewsMenuRef.current && !viewsMenuRef.current.contains(e.target as Node)) {
        setShowViewsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Stored column config for this table
  const currentTableColumnConfig: ColumnConfig | undefined = tableId ? columnConfig[tableId] : undefined
  const currentTableViews: SavedView[] = (tableId && savedViews[tableId]) ? savedViews[tableId] : []

  // Compute active & ordered columns based on preferences
  const columns = useMemo(() => {
    if (!tableId || !enableColumnControl || !currentTableColumnConfig) {
      return initialColumns
    }

    const { visibleKeys, order } = currentTableColumnConfig

    // Start with all columns mapped by key
    const colMap = new Map(initialColumns.map(c => [c.key, c]))

    // Determine order
    const orderedKeys = order && order.length > 0
      ? [
          ...order.filter(k => colMap.has(k)),
          ...initialColumns.map(c => c.key).filter(k => !order.includes(k)),
        ]
      : initialColumns.map(c => c.key)

    // Filter by visibleKeys if configured
    return orderedKeys
      .filter(k => visibleKeys ? visibleKeys.includes(k) : true)
      .map(k => colMap.get(k)!)
      .filter(Boolean)
  }, [initialColumns, tableId, enableColumnControl, currentTableColumnConfig])

  // Apply default view on mount if one exists and no filters set yet
  useEffect(() => {
    if (tableId && enableSavedViews && currentTableViews.length > 0) {
      const defaultView = currentTableViews.find(v => v.isDefault)
      if (defaultView && Object.keys(columnFilters).length === 0 && !sortKey) {
        if (defaultView.filters) setColumnFilters(defaultView.filters as Record<string, string>)
        if (defaultView.sort) {
          setSortKey(defaultView.sort.key)
          setSortDirection(defaultView.sort.direction)
        }
      }
    }
  }, [tableId, enableSavedViews])

  // Toggle column visibility
  const handleToggleColumnVisibility = (colKey: string) => {
    if (!tableId) return
    const currentVisible = currentTableColumnConfig?.visibleKeys ?? initialColumns.map(c => c.key)
    const currentOrder = currentTableColumnConfig?.order ?? initialColumns.map(c => c.key)

    let nextVisible: string[]
    if (currentVisible.includes(colKey)) {
      if (currentVisible.length <= 1) return // Keep at least one column
      nextVisible = currentVisible.filter(k => k !== colKey)
    } else {
      nextVisible = [...currentVisible, colKey]
    }

    const nextConfig: ColumnConfig = {
      visibleKeys: nextVisible,
      order: currentOrder,
    }
    setPreference('columnConfig', { ...columnConfig, [tableId]: nextConfig })
  }

  // Move column left/right in order
  const handleMoveColumn = (colKey: string, direction: 'up' | 'down') => {
    if (!tableId) return
    const currentOrder = [...(currentTableColumnConfig?.order ?? initialColumns.map(c => c.key))]
    const index = currentOrder.indexOf(colKey)
    if (index === -1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return

    const temp = currentOrder[index]
    currentOrder[index] = currentOrder[targetIndex]
    currentOrder[targetIndex] = temp

    const nextConfig: ColumnConfig = {
      visibleKeys: currentTableColumnConfig?.visibleKeys ?? initialColumns.map(c => c.key),
      order: currentOrder,
    }
    setPreference('columnConfig', { ...columnConfig, [tableId]: nextConfig })
  }

  // Reset columns to initial defaults
  const handleResetColumns = () => {
    if (!tableId) return
    const newConfigMap = { ...columnConfig }
    delete newConfigMap[tableId]
    setPreference('columnConfig', newConfigMap)
  }

  // Saved View Handlers
  const handleSaveCurrentView = () => {
    if (!tableId || !newViewName.trim()) return
    const viewId = `view_${Date.now()}`
    const newView: SavedView = {
      id: viewId,
      name: newViewName.trim(),
      filters: columnFilters,
      columnConfig: currentTableColumnConfig,
      sort: sortKey && sortDirection ? { key: sortKey, direction: sortDirection } : undefined,
      isDefault: newViewIsDefault,
    }

    let updatedViews = currentTableViews.map(v => newViewIsDefault ? { ...v, isDefault: false } : v)
    updatedViews = [...updatedViews, newView]

    setPreference('savedViews', { ...savedViews, [tableId]: updatedViews })
    setNewViewName('')
    setNewViewIsDefault(false)
  }

  const handleApplyView = (view: SavedView) => {
    setColumnFilters((view.filters as Record<string, string>) || {})
    if (view.sort) {
      setSortKey(view.sort.key)
      setSortDirection(view.sort.direction)
    } else {
      setSortKey(null)
      setSortDirection(null)
    }
    if (tableId && view.columnConfig) {
      setPreference('columnConfig', { ...columnConfig, [tableId]: view.columnConfig })
    }
    setShowViewsMenu(false)
  }

  const handleDeleteView = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!tableId) return
    const updatedViews = currentTableViews.filter(v => v.id !== viewId)
    setPreference('savedViews', { ...savedViews, [tableId]: updatedViews })
  }

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

      const col = initialColumns.find(c => c.key === colKey)
      if (!col) return

      result = result.filter(item => {
        const val = getItemValue(item, col)
        if (val === null || val === undefined) return false
        return String(val).toLowerCase().includes(search)
      })
    })

    // Apply Sorting
    if (sortKey && sortDirection) {
      const col = initialColumns.find(c => c.key === sortKey)
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
  }, [data, columnFilters, sortKey, sortDirection, initialColumns])

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

  const selectedItems = useMemo(() => {
    return data.filter(item => selectedIds.includes(idAccessor(item)))
  }, [data, selectedIds, idAccessor])

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

  const isCompact = tableDensity === 'compact'
  const cellPadding = isCompact ? 'var(--space-1) var(--space-2)' : 'var(--space-2) var(--space-3)'
  const cellFontSize = isCompact ? '0.8rem' : '0.85rem'

  return (
    <div className={`data-table-wrapper ${className}`} style={{ width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* Bulk Actions Toolbar Overlay when items are selected */}
      {selectable && selectedIds.length > 0 && bulkActions ? (
        <div
          className="bulk-actions-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--bg-glass)',
            border: '1px solid var(--brand-400)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-sm)',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="badge badge-green font-semibold" style={{ fontSize: '0.8rem' }}>
              {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-xs flex items-center gap-1"
              onClick={() => onSelectionChange && onSelectionChange([], [])}
              title="Clear current selection"
            >
              <X size={13} /> Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            {bulkActions(selectedIds, selectedItems)}
          </div>
        </div>
      ) : (
        /* Standard Top Bar (Counts, Filter reset, Columns, Views, Export) */
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
            {selectable && selectedIds.length > 0 && !bulkActions && (
              <span className="badge badge-green">
                {selectedIds.length} selected
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {extraActions}

            {/* Saved Views Button & Popover */}
            {enableSavedViews && tableId && (
              <div style={{ position: 'relative' }} ref={viewsMenuRef}>
                <button
                  type="button"
                  id={`views-btn-${tableId}`}
                  className={`btn btn-secondary btn-sm flex items-center gap-1.5 ${showViewsMenu ? 'active' : ''}`}
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setShowViewsMenu(!showViewsMenu)}
                  title="Saved Views"
                  aria-label="Manage saved table views"
                >
                  <Bookmark size={13} />
                  <span>Views</span>
                  {currentTableViews.length > 0 && (
                    <span className="badge badge-gray text-xs" style={{ padding: '0 4px' }}>
                      {currentTableViews.length}
                    </span>
                  )}
                </button>

                {showViewsMenu && (
                  <div
                    className="card"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 4px)',
                      zIndex: 100,
                      width: '280px',
                      padding: 'var(--space-3)',
                      boxShadow: 'var(--shadow-lg)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase text-muted">Saved Views</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm p-0"
                        onClick={() => setShowViewsMenu(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {currentTableViews.length > 0 ? (
                      <div className="flex flex-col gap-1 mb-3" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                        {currentTableViews.map(view => (
                          <div
                            key={view.id}
                            className="flex items-center justify-between p-1.5 rounded hover:bg-hover"
                            style={{ cursor: 'pointer', fontSize: '0.8rem' }}
                            onClick={() => handleApplyView(view)}
                          >
                            <div className="flex items-center gap-2">
                              {view.isDefault && <span className="badge badge-blue text-xs">Default</span>}
                              <span className="font-medium">{view.name}</span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm p-1 text-muted hover:text-danger"
                              onClick={(e) => handleDeleteView(view.id, e)}
                              title="Delete view"
                              aria-label={`Delete ${view.name} view`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted mb-3">No saved views yet for this table.</p>
                    )}

                    <div className="divider my-2" />

                    <div className="form-group mb-2">
                      <label className="text-xs font-semibold text-muted mb-1 block">Save Current View</label>
                      <input
                        type="text"
                        className="form-input text-xs"
                        placeholder="e.g. F4 High Protein"
                        value={newViewName}
                        onChange={e => setNewViewName(e.target.value)}
                        style={{ height: '28px' }}
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted mb-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newViewIsDefault}
                        onChange={e => setNewViewIsDefault(e.target.checked)}
                      />
                      <span>Set as default view</span>
                    </label>

                    <button
                      type="button"
                      id="save-view-confirm-btn"
                      className="btn btn-primary btn-sm w-full text-xs"
                      disabled={!newViewName.trim()}
                      onClick={handleSaveCurrentView}
                    >
                      Save View
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Column Control Button & Popover */}
            {enableColumnControl && tableId && (
              <div style={{ position: 'relative' }} ref={columnMenuRef}>
                <button
                  type="button"
                  id={`columns-btn-${tableId}`}
                  className={`btn btn-secondary btn-sm flex items-center gap-1.5 ${showColumnMenu ? 'active' : ''}`}
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  title="Customize Columns"
                  aria-label="Customize visible columns"
                >
                  <SlidersHorizontal size={13} />
                  <span>Columns</span>
                </button>

                {showColumnMenu && (
                  <div
                    className="card"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 4px)',
                      zIndex: 100,
                      width: '260px',
                      padding: 'var(--space-3)',
                      boxShadow: 'var(--shadow-lg)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase text-muted">Column Visibility</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm p-0"
                        onClick={() => setShowColumnMenu(false)}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1 mb-3" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      {initialColumns.map((col) => {
                        const isVisible = columns.some(c => c.key === col.key)
                        const headerText = typeof col.header === 'string' ? col.header : col.key
                        return (
                          <div
                            key={col.key}
                            className="flex items-center justify-between p-1 rounded hover:bg-hover text-xs"
                          >
                            <label className="flex items-center gap-2 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => handleToggleColumnVisibility(col.key)}
                              />
                              <span className={isVisible ? 'font-medium' : 'text-muted'}>
                                {headerText}
                              </span>
                            </label>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm p-0.5"
                                onClick={() => handleMoveColumn(col.key, 'up')}
                                title="Move column left"
                                aria-label={`Move ${headerText} left`}
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm p-0.5"
                                onClick={() => handleMoveColumn(col.key, 'down')}
                                title="Move column right"
                                aria-label={`Move ${headerText} right`}
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="divider my-2" />

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm w-full text-xs flex items-center justify-center gap-1.5"
                      onClick={handleResetColumns}
                    >
                      <RotateCcw size={12} /> Reset to Default
                    </button>
                  </div>
                )}
              </div>
            )}

            {exportable && (
              <button
                onClick={handleExportCSV}
                className="btn btn-secondary btn-sm flex items-center gap-1.5"
                disabled={filteredSortedData.length === 0}
                style={{ fontSize: '0.75rem' }}
                aria-label="Export data as CSV"
              >
                <Download size={13} /> Export CSV
              </button>
            )}
          </div>
        </div>
      )}

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
          background: 'var(--bg-elevated)',
        }}
      >
        <table className={`data-table ${isCompact ? 'compact' : ''}`} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', fontSize: cellFontSize }}>
          <thead style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-elevated)' } : undefined}>
            {/* Header Titles & Sort */}
            <tr>
              {selectable && (
                <th style={{ width: '40px', textAlign: 'center', padding: cellPadding }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    title="Select / Deselect all"
                    aria-label="Select all rows"
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
                      padding: cellPadding,
                      whiteSpace: 'nowrap'
                    }}
                    onClick={() => handleSort(col.key, col.sortable)}
                    className={col.className}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                      <span>{col.header}</span>
                      {isSortable && (
                        <span style={{ fontSize: '0.7rem', color: isSorted ? 'var(--brand-300)' : 'var(--text-muted)', opacity: isSorted ? 1 : 0.4 }}>
                          {isSorted ? (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>

            {/* Per-Column Search Row */}
            <tr style={{ background: 'var(--bg-card)', borderBottom: '2px solid var(--border-subtle)' }}>
              {selectable && <th style={{ padding: '3px' }}></th>}
              {columns.map(col => {
                const isSearchable = col.searchable !== false
                return (
                  <th key={`search-${col.key}`} style={{ padding: '3px 4px', textAlign: col.align || 'left' }}>
                    {isSearchable ? (
                      <input
                        type="text"
                        className="form-input"
                        style={{
                          width: '100%',
                          minWidth: '60px',
                          padding: '2px 5px',
                          fontSize: '0.72rem',
                          height: '22px',
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

                const hasRowAction = Boolean(onRowClick || detailPanel)
                const handleRowAction = () => {
                  if (onRowClick) onRowClick(item, idx)
                  else if (detailPanel) setActiveDrawerItem(item)
                }

                return (
                  <tr
                    key={key}
                    className={`${isSelected ? 'selected-row' : ''} ${customRowClass}`}
                    onClick={handleRowAction}
                    onKeyDown={(e) => {
                      if (hasRowAction && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        handleRowAction()
                      }
                    }}
                    tabIndex={hasRowAction ? 0 : undefined}
                    role={hasRowAction ? 'button' : undefined}
                    style={{
                      cursor: hasRowAction ? 'pointer' : 'default',
                      transition: 'background var(--transition-fast)'
                    }}
                  >
                    {selectable && (
                      <td
                        style={{ textAlign: 'center', padding: cellPadding }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => handleRowSelect(item, e)}
                          aria-label={`Select row ${itemId}`}
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
                            padding: cellPadding
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

      {detailPanel && (
        <DetailDrawer
          isOpen={!!activeDrawerItem}
          title={activeDrawerItem ? (activeDrawerItem.name || activeDrawerItem.lot_code || activeDrawerItem.trial_code || 'Record Details') : ''}
          onClose={() => setActiveDrawerItem(null)}
        >
          {activeDrawerItem && detailPanel(activeDrawerItem)}
        </DetailDrawer>
      )}
    </div>
  )
}

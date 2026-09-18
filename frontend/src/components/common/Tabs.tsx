import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import './Tabs.css'

export interface TabItem {
  id: string
  label: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  content: React.ReactNode
}

export interface TabsProps {
  tabs: TabItem[]
  activeTab?: string
  onChange?: (tabId: string) => void
  syncWithUrl?: boolean
  paramName?: string
  className?: string
}

export default function Tabs({
  tabs,
  activeTab: controlledActiveTab,
  onChange,
  syncWithUrl = false,
  paramName = 'tab',
  className = '',
}: TabsProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  const urlTab = syncWithUrl ? searchParams.get(paramName) : null
  const defaultTab = tabs[0]?.id ?? ''

  const currentTab = controlledActiveTab ?? (urlTab && tabs.some(t => t.id === urlTab) ? urlTab : defaultTab)

  const handleTabClick = (tabId: string) => {
    if (syncWithUrl) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set(paramName, tabId)
      setSearchParams(nextParams, { replace: true })
    }
    if (onChange) {
      onChange(tabId)
    }
  }

  // If syncWithUrl is true and url has a tab not matching controlled state or missing, sync once
  useEffect(() => {
    if (syncWithUrl && !searchParams.get(paramName) && defaultTab) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set(paramName, currentTab)
      setSearchParams(nextParams, { replace: true })
    }
  }, [syncWithUrl, paramName, currentTab, defaultTab, searchParams, setSearchParams])

  const activeTabItem = tabs.find(t => t.id === currentTab) ?? tabs[0]

  return (
    <div className={`tabs-container ${className}`}>
      <div className="tab-nav" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === currentTab
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              className={`tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              type="button"
            >
              {tab.icon && <span className="tab-icon">{tab.icon}</span>}
              <span className="tab-label">{tab.label}</span>
              {tab.badge && <span className="tab-badge">{tab.badge}</span>}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTabItem?.id}`}
        aria-labelledby={`tab-${activeTabItem?.id}`}
        className="tab-panel fade-in"
      >
        {activeTabItem?.content}
      </div>
    </div>
  )
}

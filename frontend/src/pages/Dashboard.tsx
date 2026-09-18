import { useState, useEffect } from 'react'
import {
  Sliders,
  Check,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
} from 'lucide-react'
import TopBar from '../components/TopBar'
import { useAuthStore } from '../store/authStore'
import { usePreferencesStore, DashboardWidgetConfig } from '../store/preferencesStore'
import { WIDGET_REGISTRY, ROLE_DEFAULTS } from '../components/dashboard'

export default function Dashboard() {
  const role = useAuthStore((s) => s.role)
  const { dashboardWidgets, set: setPreference } = usePreferencesStore()
  const [isCustomizing, setIsCustomizing] = useState(false)

  // Initialize role defaults if no dashboard configuration exists
  useEffect(() => {
    if (!dashboardWidgets || dashboardWidgets.length === 0) {
      const defaultWidgetIds = ROLE_DEFAULTS[role ?? 'breeder'] ?? ROLE_DEFAULTS.breeder
      const initialConfigs: DashboardWidgetConfig[] = defaultWidgetIds.map((id, index) => ({
        id,
        visible: true,
        order: index,
      }))
      setPreference('dashboardWidgets', initialConfigs)
    }
  }, [dashboardWidgets, role, setPreference])

  const currentConfigs = dashboardWidgets && dashboardWidgets.length > 0
    ? dashboardWidgets
    : (ROLE_DEFAULTS[role ?? 'breeder'] ?? ROLE_DEFAULTS.breeder).map((id, index) => ({
        id,
        visible: true,
        order: index,
      }))

  const visibleWidgetConfigs = currentConfigs
    .filter((w) => w.visible)
    .sort((a, b) => a.order - b.order)

  const activeWidgetIds = visibleWidgetConfigs.map((w) => w.id)
  const availableWidgetsToAdd = Object.values(WIDGET_REGISTRY).filter(
    (w) => !activeWidgetIds.includes(w.id)
  )

  const handleMoveWidget = (id: string, direction: 'up' | 'down') => {
    const list = [...visibleWidgetConfigs]
    const index = list.findIndex((w) => w.id === id)
    if (index === -1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= list.length) return

    const temp = list[index]
    list[index] = list[targetIndex]
    list[targetIndex] = temp

    const updated = list.map((item, idx) => ({
      ...item,
      order: idx,
    }))

    setPreference('dashboardWidgets', updated)
  }

  const handleRemoveWidget = (id: string) => {
    const updated = visibleWidgetConfigs
      .filter((w) => w.id !== id)
      .map((item, idx) => ({
        ...item,
        order: idx,
      }))
    setPreference('dashboardWidgets', updated)
  }

  const handleAddWidget = (id: string) => {
    const newConfig: DashboardWidgetConfig = {
      id,
      visible: true,
      order: visibleWidgetConfigs.length,
    }
    const updated = [...visibleWidgetConfigs, newConfig]
    setPreference('dashboardWidgets', updated)
  }

  const handleResetToRoleDefault = () => {
    const defaultWidgetIds = ROLE_DEFAULTS[role ?? 'breeder'] ?? ROLE_DEFAULTS.breeder
    const initialConfigs: DashboardWidgetConfig[] = defaultWidgetIds.map((id, index) => ({
      id,
      visible: true,
      order: index,
    }))
    setPreference('dashboardWidgets', initialConfigs)
  }

  return (
    <div className="page-shell">
      <TopBar
        title="Dashboard"
        subtitle="Overview of your wheat breeding programs and active operations"
        actions={
          <button
            id="customize-dashboard-btn"
            type="button"
            className={`btn btn-sm flex items-center gap-1.5 ${
              isCustomizing ? 'btn-primary' : 'btn-secondary'
            }`}
            onClick={() => setIsCustomizing(!isCustomizing)}
            title="Customize dashboard widget layout"
            aria-label="Customize dashboard"
          >
            {isCustomizing ? (
              <>
                <Check size={14} /> Done
              </>
            ) : (
              <>
                <Sliders size={14} /> Customize
              </>
            )}
          </button>
        }
      />

      {/* Customize Mode Banner */}
      {isCustomizing && (
        <div
          id="customize-mode-banner"
          className="alert alert-info slide-in mb-6"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div className="flex items-center gap-2">
            <Sliders size={18} />
            <span className="font-semibold text-sm">
              Dashboard Customization Mode: Reorder, remove, or add widgets
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="reset-dashboard-btn"
              type="button"
              className="btn btn-ghost btn-sm text-xs flex items-center gap-1"
              onClick={handleResetToRoleDefault}
            >
              <RotateCcw size={13} /> Reset to Default
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm text-xs flex items-center gap-1"
              onClick={() => setIsCustomizing(false)}
            >
              <Check size={13} /> Finish Customizing
            </button>
          </div>
        </div>
      )}

      {/* Widget List */}
      <div className="dashboard-widgets-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {visibleWidgetConfigs.map((cfg, index) => {
          const widgetDef = WIDGET_REGISTRY[cfg.id]
          if (!widgetDef) return null

          const WidgetComponent = widgetDef.component

          return (
            <div
              key={cfg.id}
              className={`dashboard-widget-wrapper ${isCustomizing ? 'card p-3 mb-4' : ''}`}
              style={
                isCustomizing
                  ? {
                      border: '2px dashed var(--border-default)',
                      borderRadius: 'var(--r-md)',
                      position: 'relative',
                    }
                  : undefined
              }
            >
              {isCustomizing && (
                <div
                  className="flex items-center justify-between pb-2 mb-3 border-b"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="badge badge-gray text-xs font-semibold">
                      #{index + 1}
                    </span>
                    <span className="font-semibold text-sm">{widgetDef.label}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm p-1"
                      onClick={() => handleMoveWidget(cfg.id, 'up')}
                      disabled={index === 0}
                      title="Move widget up"
                      aria-label={`Move ${widgetDef.label} up`}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm p-1"
                      onClick={() => handleMoveWidget(cfg.id, 'down')}
                      disabled={index === visibleWidgetConfigs.length - 1}
                      title="Move widget down"
                      aria-label={`Move ${widgetDef.label} down`}
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      id={`remove-widget-${cfg.id}`}
                      className="btn btn-ghost btn-sm p-1 text-danger"
                      onClick={() => handleRemoveWidget(cfg.id)}
                      title="Remove widget"
                      aria-label={`Remove ${widgetDef.label} from dashboard`}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}

              <WidgetComponent />
            </div>
          )
        })}
      </div>

      {/* Available Widgets to Add (When in Customization Mode) */}
      {isCustomizing && availableWidgetsToAdd.length > 0 && (
        <section className="card mt-6" style={{ border: '2px solid var(--border-default)' }}>
          <div className="card-header flex items-center gap-2 mb-4">
            <Plus size={18} className="text-brand-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Add Widgets to Dashboard
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
            {availableWidgetsToAdd.map((w) => (
              <div
                key={w.id}
                className="card flex flex-col justify-between p-3 hover-row"
                style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
              >
                <div>
                  <div className="font-semibold text-sm mb-1">{w.label}</div>
                  <div className="text-xs text-muted mb-3">{w.description}</div>
                </div>
                <button
                  type="button"
                  id={`add-widget-${w.id}`}
                  className="btn btn-secondary btn-sm text-xs flex items-center justify-center gap-1"
                  onClick={() => handleAddWidget(w.id)}
                >
                  <Plus size={13} /> Add to Dashboard
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

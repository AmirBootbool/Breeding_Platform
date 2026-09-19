import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Popup, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { locations, trials, Trial } from '../api/client'
import { MapPin, Eye, Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Default fallback coordinate: International Maize and Wheat Improvement Center (CIMMYT) / standard agricultural research region
const DEFAULT_CENTER: [number, number] = [19.5312, -98.8576]

export default function NurseryMap() {
  const navigate = useNavigate()
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [regionFilter, setRegionFilter] = useState<string>('all')

  const { data: locationData, isLoading: locationsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locations.list(),
  })

  const { data: trialData, isLoading: trialsLoading } = useQuery({
    queryKey: ['trials'],
    queryFn: () => trials.list(),
  })

  const locationList = locationData?.results ?? []
  const trialList = trialData?.results ?? []

  // Group trials by location
  const trialsByLocation = useMemo(() => {
    const map = new Map<number, Trial[]>()
    trialList.forEach(t => {
      if (t.location) {
        const existing = map.get(t.location) ?? []
        map.set(t.location, [...existing, t])
      }
    })
    return map
  }, [trialList])

  // Extract unique regions
  const regions = useMemo(() => {
    const set = new Set<string>()
    locationList.forEach(l => {
      if (l.region) set.add(l.region)
    })
    return Array.from(set).sort()
  }, [locationList])

  // Filter locations
  const filteredLocations = useMemo(() => {
    return locationList.filter(l => {
      if (regionFilter !== 'all' && l.region !== regionFilter) return false
      return true
    })
  }, [locationList, regionFilter])

  // Locations with valid GPS coordinates
  const mappedLocations = useMemo(() => {
    return filteredLocations.filter(l => l.latitude !== null && l.longitude !== null)
  }, [filteredLocations])

  // Calculate center coordinate
  const centerCoord: [number, number] = useMemo(() => {
    if (mappedLocations.length > 0) {
      const avgLat = mappedLocations.reduce((sum, l) => sum + (l.latitude ?? 0), 0) / mappedLocations.length
      const avgLng = mappedLocations.reduce((sum, l) => sum + (l.longitude ?? 0), 0) / mappedLocations.length
      return [avgLat, avgLng]
    }
    return DEFAULT_CENTER
  }, [mappedLocations])

  const activeSelectedLocation = locationList.find(l => l.id === selectedLocationId)
  const activeSelectedTrials = selectedLocationId ? (trialsByLocation.get(selectedLocationId) ?? []) : []

  const isLoading = locationsLoading || trialsLoading

  return (
    <div className="page-container nursery-map-page" style={{ padding: 'var(--space-4)', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Compass className="text-brand-400" size={26} />
            Field & Nursery GIS Map
          </h1>
          <p className="text-sm text-muted">
            Geographic overview of active trial locations, research stations, and environment footprints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Region Filter:</span>
          <select
            className="form-input"
            style={{ width: 160, padding: '4px 8px', fontSize: '0.85rem' }}
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
          >
            <option value="all">All Regions ({locationList.length})</option>
            {regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center"><div className="spinner" /> Loading nursery map and stations…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-4)', minHeight: '650px' }}>
          {/* Leaflet Map Canvas */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', height: '650px', position: 'relative' }}>
            <MapContainer
              center={centerCoord}
              zoom={mappedLocations.length > 0 ? 5 : 3}
              style={{ height: '100%', width: '100%', zIndex: 1 }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {mappedLocations.map(loc => {
                const locTrials = trialsByLocation.get(loc.id) ?? []
                const isSelected = selectedLocationId === loc.id
                return (
                  <CircleMarker
                    key={loc.id}
                    center={[loc.latitude!, loc.longitude!]}
                    radius={isSelected ? 14 : 9}
                    pathOptions={{
                      color: isSelected ? '#38bdf8' : '#22c55e',
                      fillColor: isSelected ? '#0284c7' : '#16a34a',
                      fillOpacity: 0.8,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => setSelectedLocationId(loc.id),
                    }}
                  >
                    <Popup>
                      <div style={{ color: '#0f172a', padding: 2 }}>
                        <strong style={{ fontSize: '1.05rem', display: 'block', marginBottom: 2 }}>{loc.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 6 }}>
                          {loc.region ? `${loc.region}, ` : ''}{loc.country}
                        </div>
                        <div style={{ fontSize: '0.8rem', marginBottom: 8 }}>
                          <strong>Active Trials:</strong> {locTrials.length}
                        </div>
                        {locTrials.length > 0 && (
                          <div style={{ maxHeight: 100, overflowY: 'auto', marginBottom: 8 }}>
                            {locTrials.map(t => (
                              <div key={t.id} style={{ fontSize: '0.75rem', padding: '2px 0', borderBottom: '1px solid #e2e8f0' }}>
                                <span style={{ fontWeight: 600 }}>{t.trial_code}</span> ({t.purpose})
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          style={{ width: '100%', fontSize: '0.75rem', padding: '3px 6px' }}
                          onClick={() => setSelectedLocationId(loc.id)}
                        >
                          View Location Details
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </MapContainer>
          </div>

          {/* Right Side Location & Trials Drawer */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: '650px', overflowY: 'auto' }}>
            <h3 className="card-title flex items-center gap-2" style={{ margin: 0 }}>
              <MapPin size={18} className="text-brand-400" />
              Nursery Stations ({filteredLocations.length})
            </h3>

            {activeSelectedLocation ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ padding: 'var(--space-3)', background: 'rgba(74, 222, 128, 0.08)', borderRadius: 'var(--r-md)', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-base">{activeSelectedLocation.name}</h4>
                      <p className="text-xs text-muted">
                        {activeSelectedLocation.region ? `${activeSelectedLocation.region}, ` : ''}{activeSelectedLocation.country}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedLocationId(null)}
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ marginTop: 'var(--space-2)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div><strong>Coordinates:</strong> {activeSelectedLocation.latitude ?? 'N/A'}, {activeSelectedLocation.longitude ?? 'N/A'}</div>
                    <div><strong>Total Trials:</strong> {activeSelectedTrials.length}</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                    Trials at this station:
                  </h4>
                  {activeSelectedTrials.length === 0 ? (
                    <p className="text-xs text-muted">No active trials recorded at this station.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {activeSelectedTrials.map(t => (
                        <div
                          key={t.id}
                          className="card"
                          style={{ padding: 'var(--space-2)', fontSize: '0.8rem', borderLeft: '3px solid var(--brand-400)' }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold">{t.trial_code}</span>
                            <span className="badge badge-blue">{t.season_name}</span>
                          </div>
                          <div className="text-xs text-muted">{t.name}</div>
                          <div className="text-xs text-muted mt-1">Design: {t.design_type} • Plots: {t.plot_count}</div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-xs mt-2 w-full flex items-center justify-center gap-1"
                            onClick={() => navigate('/trials')}
                          >
                            <Eye size={12} /> Open in Trial Manager
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <p className="text-xs text-muted">
                  Click a pin on the map or select a nursery station below to inspect its environmental profile and active trials.
                </p>
                {filteredLocations.map(l => {
                  const count = (trialsByLocation.get(l.id) ?? []).length
                  return (
                    <div
                      key={l.id}
                      onClick={() => setSelectedLocationId(l.id)}
                      className="hover-row"
                      style={{
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--r-sm)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'between',
                        alignItems: 'center',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="font-semibold text-sm">{l.name}</div>
                        <div className="text-xs text-muted">
                          {l.region ? `${l.region}, ` : ''}{l.country}
                          {l.latitude && l.longitude ? ` • GPS ✓` : ' • No GPS'}
                        </div>
                      </div>
                      <span className="badge badge-green text-xs">{count} trials</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { weather, Trial, WeatherObservation } from '../../api/client'
import { useToast } from '../common/ToastProvider'

export default function WeatherTab({ trial }: { trial: Trial }) {
  const qc = useQueryClient()
  const { showToast } = useToast()
  const [isUploading, setIsUploading] = useState(false)

  const { data: weatherData, isLoading } = useQuery({
    queryKey: ['weather-observations', trial.location],
    queryFn: () => weather.list(`&location=${trial.location}`),
    enabled: !!trial.location,
  })

  const allObservations: WeatherObservation[] = weatherData?.results ?? []

  // Filter observations within planting_date and harvest_date (or all if not specified)
  const observations = allObservations.filter(obs => {
    if (trial.planting_date && obs.date < trial.planting_date) return false
    if (trial.harvest_date && obs.date > trial.harvest_date) return false
    return true
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    try {
      const res = await weather.importCsv(file)
      showToast(`Weather data imported: ${res.created_count} created, ${res.updated_count} updated.`, 'success')
      qc.invalidateQueries({ queryKey: ['weather-observations'] })
    } catch {
      showToast('Failed to import weather CSV.', 'error')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  if (!trial.location) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🌤</div>
        <p>No location set for this trial. Set a trial location to view associated weather observations.</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="loading-spinner"><div className="spinner" /> Loading weather data…</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <p className="text-sm text-muted">
          Weather history at <strong>{trial.location_name}</strong>
          {trial.planting_date && ` from ${trial.planting_date}`}
          {trial.harvest_date ? ` to ${trial.harvest_date}` : ' to date'}.
        </p>
        <label className="btn btn-secondary btn-sm" style={{ cursor: isUploading ? 'not-allowed' : 'pointer' }}>
          {isUploading ? 'Importing…' : '📁 Import Weather CSV'}
          <input
            type="file"
            accept=".csv,.xlsx"
            style={{ display: 'none' }}
            disabled={isUploading}
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {observations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🌤</div>
          <p>No weather records recorded for this location during the trial timeline.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Min Temp (°C)</th>
              <th>Max Temp (°C)</th>
              <th>Precipitation (mm)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {observations.map(obs => (
              <tr key={obs.id}>
                <td className="font-mono">{obs.date}</td>
                <td>{obs.temp_min_c !== null ? `${obs.temp_min_c}°C` : '—'}</td>
                <td>{obs.temp_max_c !== null ? `${obs.temp_max_c}°C` : '—'}</td>
                <td>{obs.precipitation_mm !== null ? `${obs.precipitation_mm} mm` : '—'}</td>
                <td className="text-xs text-muted">{obs.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

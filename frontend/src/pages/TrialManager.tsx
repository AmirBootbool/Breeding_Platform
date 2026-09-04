import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  trials, programs, locations, seasons,
  Trial, ApiError
} from '../api/client'
import { useAuthStore } from '../store/authStore'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { DesignBadge } from '../components/trials/types'
import TrialDetail from '../components/trials/TrialDetail'
import TrialFormModal from '../components/trials/TrialFormModal'

export default function TrialManager() {
  const role = useAuthStore(s => s.role)
  const canWrite = role === 'admin' || role === 'breeder'

  const [search, setSearch] = useState('')
  const [selectedTrial, setSelectedTrial] = useState<Trial | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editTrial, setEditTrial] = useState<Trial | null>(null)
  const [deleteTrial, setDeleteTrial] = useState<Trial | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['trials', search],
    queryFn: () => trials.list(search ? `&search=${encodeURIComponent(search)}` : ''),
    placeholderData: prev => prev,
  })

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
    enabled: showCreate || !!editTrial,
  })

  const { data: locationsData } = useQuery({
    queryKey: ['locations-all'],
    queryFn: () => locations.list(),
    enabled: showCreate || !!editTrial,
  })

  const { data: seasonsData } = useQuery({
    queryKey: ['seasons-all'],
    queryFn: () => seasons.list(),
    enabled: showCreate || !!editTrial,
  })

  const programList = programsData?.results ?? []
  const locationList = locationsData?.results ?? []
  const seasonList = seasonsData?.results ?? []

  const deleteMutation = useMutation({
    mutationFn: () => trials.destroy(deleteTrial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      qc.invalidateQueries({ queryKey: ['trials-all'] })
      setDeleteTrial(null)
      if (selectedTrial?.id === deleteTrial?.id) {
        setSelectedTrial(null)
      }
    },
    onError: (err) => {
      alert(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message)
    },
  })

  if (selectedTrial) {
    return (
      <div className="page-shell">
        <TopBar
          title={selectedTrial.name}
          subtitle={`${selectedTrial.trial_code} — ${selectedTrial.location_name} (${selectedTrial.season_name})`}
          actions={
            <button className="btn btn-secondary" onClick={() => setSelectedTrial(null)}>
              ← Back to Trials
            </button>
          }
        />
        <TrialDetail key={selectedTrial.id} trial={selectedTrial} />
      </div>
    )
  }

  return (
    <div className="page-shell">
      <TopBar
        title="Trial Manager"
        subtitle={`${data?.count ?? '…'} trials`}
        actions={canWrite ? (
          <button id="new-trial-btn" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New Trial
          </button>
        ) : undefined}
      />

      <div className="toolbar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            id="trial-search"
            type="search"
            placeholder="Search trial code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="loading-spinner"><div className="spinner" /> Loading trials…</div>
      ) : (
        <div className="table-container mb-8">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Program</th>
                <th>Location</th>
                <th>Season</th>
                <th>Design</th>
                <th>Reps</th>
                <th>Plots</th>
                {canWrite && <th style={{ width: 80 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.results.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 9 : 8} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                    No trials found.
                  </td>
                </tr>
              ) : data?.results.map((t: Trial) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTrial(t)}
                  style={{ cursor: 'pointer' }}
                >
                  <td><code className="font-mono text-sm" style={{ color: 'var(--brand-300)' }}>{t.trial_code}</code></td>
                  <td><strong>{t.name}</strong></td>
                  <td className="text-sm text-muted">{t.program_name}</td>
                  <td className="text-sm">{t.location_name}</td>
                  <td className="text-sm">{t.season_name}</td>
                  <td><DesignBadge type={t.design_type} /></td>
                  <td className="text-sm">{t.num_reps}</td>
                  <td className="text-sm">{t.plot_count}</td>
                  {canWrite && (
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <button
                          id={`edit-trial-${t.id}`}
                          className="btn btn-ghost btn-sm"
                          title="Edit"
                          onClick={() => setEditTrial(t)}
                        >
                          ✏
                        </button>
                        <button
                          id={`delete-trial-${t.id}`}
                          className="btn btn-ghost btn-sm"
                          title="Delete"
                          style={{ color: 'var(--status-danger)' }}
                          onClick={() => setDeleteTrial(t)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Create Trial" onClose={() => setShowCreate(false)} wide>
          <TrialFormModal
            programList={programList}
            locationList={locationList}
            seasonList={seasonList}
            onClose={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editTrial && (
        <Modal title={`Edit — ${editTrial.trial_code}`} onClose={() => setEditTrial(null)} wide>
          <TrialFormModal
            initial={editTrial}
            programList={programList}
            locationList={locationList}
            seasonList={seasonList}
            onClose={() => setEditTrial(null)}
            isEdit
            editId={editTrial.id}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTrial && (
        <ConfirmDialog
          message={`Delete trial "${deleteTrial.trial_code}"? This will also delete all ${deleteTrial.plot_count} plots and all associated observations. This cannot be undone.`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteTrial(null)}
        />
      )}
    </div>
  )
}

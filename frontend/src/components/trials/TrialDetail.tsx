import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { trials, plots, observations, observationVariables, traitPanels, Trial } from '../../api/client'
import { offlineStorage } from '../../services/offlineStorage'
import Modal from '../Modal'
import ObservationGrid from '../ObservationGrid'
import { DesignBadge } from './types'
import PlotGrid from './PlotGrid'
import SummaryChart from './SummaryChart'
import GermplasmListTab from './GermplasmListTab'
import AdvancePlotsTab from './AdvancePlotsTab'
import GenerateLayoutModal from './GenerateLayoutModal'
import ImportFieldBookModal from './ImportFieldBookModal'
import PedigreeTreeModal from '../pedigree/PedigreeTreeModal'

interface TrialDetailProps {
  trial: Trial
}

export default function TrialDetail({ trial }: TrialDetailProps) {
  const [tab, setTab] = useState<'germplasm' | 'map' | 'data' | 'selections' | 'summary' | 'pedigree'>('germplasm')
  const [showGenerateLayout, setShowGenerateLayout] = useState(false)
  const [showImportFieldBook, setShowImportFieldBook] = useState(false)
  const [pedigreeEntry, setPedigreeEntry] = useState<{ id: number; name: string } | null>(null)
  const [isOfflineCached, setIsOfflineCached] = useState(false)
  const [downloadingOffline, setDownloadingOffline] = useState(false)
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    offlineStorage.getTrialPackage(trial.id).then(pkg => {
      setIsOfflineCached(!!pkg)
    })
  }, [trial.id])

  const handleDownloadOffline = async () => {
    setDownloadingOffline(true)
    setOfflineMessage('Packaging trial dataset for offline scoring…')
    try {
      const [plotsRes, varsRes, panelsRes, obsRes] = await Promise.all([
        plots.list(`&trial=${trial.id}&page_size=500`),
        observationVariables.list(),
        traitPanels.list(),
        observations.list(`&plot__trial=${trial.id}&page_size=1000`),
      ])

      await offlineStorage.saveTrialPackage({
        trialId: trial.id,
        trialCode: trial.trial_code,
        name: trial.name,
        programName: trial.program_name || '',
        plots: plotsRes?.results || [],
        variables: varsRes?.results || [],
        panels: panelsRes?.results || [],
        existingObservations: obsRes?.results || [],
        downloadedAt: Date.now(),
      })

      setIsOfflineCached(true)
      setOfflineMessage('✓ Trial is ready for offline field scoring!')
      setTimeout(() => setOfflineMessage(null), 3500)
    } catch (e: any) {
      setOfflineMessage(`⚠️ Failed to download package: ${e.message}`)
    } finally {
      setDownloadingOffline(false)
    }
  }

  const { data: plotData, isLoading: plotLoading } = useQuery({
    queryKey: ['plots', trial.id],
    queryFn: () => plots.list(`&trial=${trial.id}&page_size=500`),
  })

  const { data: summaryData } = useQuery({
    queryKey: ['trial-summary', trial.id],
    queryFn: () => trials.summary(trial.id),
  })

  const plotList = plotData?.results ?? []

  return (
    <div className="fade-in">
      <div className="card mb-6">
        <div className="grid-4" style={{ gap: 'var(--space-5)' }}>
          <div>
            <div className="card-title">Trial Code</div>
            <code className="font-mono" style={{ color: 'var(--brand-300)', fontSize: '1rem' }}>{trial.trial_code}</code>
          </div>
          <div>
            <div className="card-title">Design</div>
            <DesignBadge type={trial.design_type} />
          </div>
          <div>
            <div className="card-title">Location</div>
            <span className="text-sm">{trial.location_name}</span>
          </div>
          <div>
            <div className="card-title">Season</div>
            <span className="text-sm">{trial.season_name}</span>
          </div>
          <div>
            <div className="card-title">Replications</div>
            <span className="text-sm">{trial.num_reps}</span>
          </div>
          {(trial.design_type === 'alpha_lattice' || trial.design_type === 'augmented_block') && (
            <div>
              <div className="card-title">Block Size</div>
              <span className="text-sm">{trial.block_size}</span>
            </div>
          )}
          {trial.design_type === 'prep' && (
            <div>
              <div className="card-title">P-Rep Fraction</div>
              <span className="text-sm">{trial.prep_fraction}</span>
            </div>
          )}
          <div>
            <div className="card-title">Plots</div>
            <span className="text-sm">{trial.plot_count}</span>
          </div>
          <div>
            <div className="card-title">Program</div>
            <span className="text-sm">{trial.program_name}</span>
          </div>
          {trial.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="card-title">Notes</div>
              <span className="text-sm text-muted">{trial.notes}</span>
            </div>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {plotList.length === 0 && !plotLoading && (
            <button
              id="create-plots-btn"
              className="btn btn-primary"
              onClick={() => setShowGenerateLayout(true)}
            >
              ⊞ Generate Layout
            </button>
          )}
          {plotList.length > 0 && (
            <>
              <button
                id="import-fieldbook-btn"
                className="btn btn-primary"
                onClick={() => setShowImportFieldBook(true)}
              >
                📥 Import Field Book
              </button>
              <button
                id="export-fieldbook-btn"
                className="btn btn-secondary"
                onClick={() => trials.exportFieldBook(trial.id)}
              >
                📄 Export Field Book CSV
              </button>
              <button
                id="export-map-btn"
                className="btn btn-secondary"
                onClick={() => trials.exportMap(trial.id)}
              >
                🗺️ Export Trial Map CSV
              </button>
              <button
                id="download-offline-btn"
                className={`btn ${isOfflineCached ? 'btn-secondary' : 'btn-secondary'}`}
                style={{
                  border: isOfflineCached ? '1px solid var(--brand-400)' : undefined,
                  background: isOfflineCached ? 'rgba(74, 222, 128, 0.1)' : undefined,
                }}
                disabled={downloadingOffline}
                onClick={handleDownloadOffline}
                title="Download all plots and traits into local IndexedDB for field scoring without internet"
              >
                {downloadingOffline ? '📦 Downloading…' : isOfflineCached ? '✓ Offline Ready (Refresh)' : '📦 Make Available Offline'}
              </button>
            </>
          )}
        </div>
        {offlineMessage && (
          <div className="alert alert-info mt-4" style={{ margin: 'var(--space-4) 0 0 0' }}>
            <span>ℹ️</span><span>{offlineMessage}</span>
          </div>
        )}
      </div>

      <div className="tab-bar">
        {(['germplasm', 'map', 'data', 'selections', 'summary', 'pedigree'] as const).map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'germplasm'  ? '🌿 Germplasm'
              : t === 'map'    ? '🗺️ Trial Map'
              : t === 'data'   ? '📋 Data'
              : t === 'selections' ? '✂️ Selections'
              : t === 'summary'   ? '📊 Summary'
              :                    '🧬 Pedigree'}
          </button>
        ))}
      </div>

      {tab === 'germplasm' && (
        <div className="card">
          <GermplasmListTab plotList={plotList} expectedReps={trial.num_reps} />
        </div>
      )}
      {tab === 'map' && (
        plotLoading ? (
          <div className="loading-spinner"><div className="spinner" /> Loading plots...</div>
        ) : plotList.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🌱</div><p>No plots yet.</p></div>
        ) : (
          <div className="card"><PlotGrid plotList={plotList} /></div>
        )
      )}
      {tab === 'data' && (
        <ObservationGrid trial={trial} />
      )}
      {tab === 'summary' && (
        <div className="card"><SummaryChart rows={summaryData?.summary ?? []} /></div>
      )}
      {tab === 'selections' && (
        <div className="card"><AdvancePlotsTab trial={trial} plotList={plotList} /></div>
      )}
      {tab === 'pedigree' && (() => {
        const uniqueGermplasm = Array.from(
          new Map(plotList.map(p => [p.germplasm, { id: p.germplasm, name: p.germplasm_name }])).values()
        )
        return (
          <div className="card">
            <div className="card-title mb-4">🧬 Pedigree — {uniqueGermplasm.length} unique lines</div>
            <div className="grid-3" style={{ gap: 'var(--space-3)' }}>
              {uniqueGermplasm.map(g => (
                <div key={g.id} style={{ padding: 'var(--space-3)', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.87rem', fontWeight: 600 }}>{g.name}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPedigreeEntry(g)}>🌳</button>
                </div>
              ))}
            </div>
            {uniqueGermplasm.length === 0 && <div className="empty-state"><p>No germplasm in this trial yet.</p></div>}
          </div>
        )
      })()}

      {showGenerateLayout && (
        <Modal title={`Generate Layout — ${trial.trial_code}`} onClose={() => setShowGenerateLayout(false)} wide>
          <GenerateLayoutModal
            trial={trial}
            onClose={() => setShowGenerateLayout(false)}
            onSuccess={() => {
              setShowGenerateLayout(false)
              qc.invalidateQueries({ queryKey: ['plots', trial.id] })
              qc.invalidateQueries({ queryKey: ['trials'] })
            }}
          />
        </Modal>
      )}

      {showImportFieldBook && (
        <Modal
          title={`Import Field Book — ${trial.trial_code}`}
          onClose={() => setShowImportFieldBook(false)}
          wide
        >
          <ImportFieldBookModal
            trial={trial}
            onClose={() => setShowImportFieldBook(false)}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['observations-for-trial', trial.id] })
              qc.invalidateQueries({ queryKey: ['trial-summary', trial.id] })
            }}
          />
        </Modal>
      )}
      {pedigreeEntry && (
        <Modal title={`Pedigree — ${pedigreeEntry.name}`} onClose={() => setPedigreeEntry(null)} wide>
          <PedigreeTreeModal
            germplasmId={pedigreeEntry.id}
            germplasmName={pedigreeEntry.name}
            onClose={() => setPedigreeEntry(null)}
          />
        </Modal>
      )}
    </div>
  )
}

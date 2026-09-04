import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { trials, plots, Trial } from '../../api/client'
import Modal from '../Modal'
import ObservationGrid from '../ObservationGrid'
import { DesignBadge } from './types'
import PlotGrid from './PlotGrid'
import SummaryChart from './SummaryChart'
import GermplasmListTab from './GermplasmListTab'
import AdvancePlotsTab from './AdvancePlotsTab'
import GenerateLayoutModal from './GenerateLayoutModal'
import ImportFieldBookModal from './ImportFieldBookModal'

interface TrialDetailProps {
  trial: Trial
}

export default function TrialDetail({ trial }: TrialDetailProps) {
  const [tab, setTab] = useState<'germplasm' | 'map' | 'data' | 'selections' | 'summary'>('germplasm')
  const [showGenerateLayout, setShowGenerateLayout] = useState(false)
  const [showImportFieldBook, setShowImportFieldBook] = useState(false)
  const qc = useQueryClient()

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
            </>
          )}
        </div>
      </div>

      <div className="tab-bar">
        {(['germplasm', 'map', 'data', 'selections', 'summary'] as const).map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'germplasm' ? '🌿 Germplasm List'
              : t === 'map' ? '🗺️ Trial Map'
              : t === 'data' ? '📋 Data Collection'
              : t === 'selections' ? '✂️ Selections'
              : '📊 Summary'}
          </button>
        ))}
      </div>

      {tab === 'germplasm' && (
        <div className="card">
          <GermplasmListTab plotList={plotList} />
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
    </div>
  )
}

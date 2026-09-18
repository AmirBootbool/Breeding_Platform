import { useQuery } from '@tanstack/react-query'
import { programs, germplasm, trials, observations } from '../../api/client'
import { useUiStore } from '../../store/uiStore'

export default function StatStripWidget() {
  const selectedProgramId = useUiStore((s) => s.activeProgramId)

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => programs.list(),
  })

  const { data: germplasmData } = useQuery({
    queryKey: ['germplasm-count', selectedProgramId],
    queryFn: () => germplasm.list(selectedProgramId ? `&program=${selectedProgramId}&page_size=1` : '&page_size=1'),
  })

  const { data: trialsData } = useQuery({
    queryKey: ['trials-count', selectedProgramId],
    queryFn: () => trials.list(selectedProgramId ? `&program=${selectedProgramId}&page_size=1` : '&page_size=1'),
  })

  const { data: recentObs } = useQuery({
    queryKey: ['recent-observations'],
    queryFn: () => observations.list('&ordering=-created_at&page_size=10'),
  })

  return (
    <div className="grid-4 mb-6">
      <div className="stat-card fade-in" style={{ borderTop: '3px solid hsl(142,52%,44%)' }}>
        <div className="stat-icon">🗂</div>
        <div className="stat-label">Programs</div>
        <div className="stat-value">{programsData?.count ?? '—'}</div>
        <div className="stat-sub">Active breeding scopes</div>
      </div>
      <div className="stat-card fade-in" style={{ borderTop: '3px solid hsl(210,70%,60%)' }}>
        <div className="stat-icon">🌱</div>
        <div className="stat-label">Germplasm</div>
        <div className="stat-value">{germplasmData?.count ?? '—'}</div>
        <div className="stat-sub">Registered accessions</div>
      </div>
      <div className="stat-card fade-in" style={{ borderTop: '3px solid hsl(45,90%,55%)' }}>
        <div className="stat-icon">🧪</div>
        <div className="stat-label">Trials</div>
        <div className="stat-value">{trialsData?.count ?? '—'}</div>
        <div className="stat-sub">Active & past trials</div>
      </div>
      <div className="stat-card fade-in" style={{ borderTop: '3px solid hsl(280,55%,60%)' }}>
        <div className="stat-icon">📊</div>
        <div className="stat-label">Observations</div>
        <div className="stat-value">{recentObs?.count ?? '—'}</div>
        <div className="stat-sub">Data points recorded</div>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { preferences } from './api/client'
import { useAuthStore } from './store/authStore'
import { useUiStore } from './store/uiStore'
import { usePreferencesStore } from './store/preferencesStore'
import Sidebar from './components/Sidebar'
import CommandPalette from './components/common/CommandPalette'
import { ToastProvider } from './components/common/ToastProvider'
import LoginPage from './pages/Login'
import Dashboard from './pages/Dashboard'
import GermplasmBrowser from './pages/GermplasmBrowser'
import CrossingBlock from './pages/CrossingBlock'
import TrialManager from './pages/TrialManager'
import ObservationEntry from './pages/ObservationEntry'
import DataExport from './pages/DataExport'
import Setup from './pages/Setup'
import MultiEnvironmentAnalysis from './pages/MultiEnvironmentAnalysis'
import Traits from './pages/Traits'
import SeedInventory from './pages/SeedInventory'
import AuditTrail from './pages/AuditTrail'
import Genomics from './pages/Genomics'
import Preferences from './pages/Preferences'
import Compare from './pages/Compare'
import SeasonReport from './pages/SeasonReport'
import PublicSharedReport from './pages/PublicSharedReport'
import TodaysTasks from './pages/TodaysTasks'
import NurseryMap from './pages/NurseryMap'

function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const hydrateFromServer = usePreferencesStore((s) => s.hydrateFromServer)

  const { data: prefData } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => preferences.get(),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (prefData) {
      hydrateFromServer(prefData)
    }
  }, [prefData, hydrateFromServer])

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [toggleCommandPalette])

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Sidebar />
      <main id="main-content" className="page-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/germplasm" element={<GermplasmBrowser />} />
          <Route path="/germplasm/compare" element={<Compare />} />
          <Route path="/crosses" element={<CrossingBlock />} />
          <Route path="/tasks" element={<TodaysTasks />} />
          <Route path="/seed-inventory" element={<SeedInventory />} />
          <Route path="/trials" element={<TrialManager />} />
          <Route path="/nursery-map" element={<NurseryMap />} />
          <Route path="/observations" element={<ObservationEntry />} />
          <Route path="/seasons/:seasonId/report" element={<SeasonReport />} />
          <Route path="/export" element={<DataExport />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/analysis" element={<MultiEnvironmentAnalysis />} />
          <Route path="/traits" element={<Traits />} />
          <Route path="/genomics" element={<Genomics />} />
          <Route path="/audit" element={<AuditTrail />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <CommandPalette />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/shared/:token" element={<PublicSharedReport />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}

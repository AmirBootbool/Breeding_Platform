import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/Login'
import Dashboard from './pages/Dashboard'
import GermplasmBrowser from './pages/GermplasmBrowser'
import TrialManager from './pages/TrialManager'
import ObservationEntry from './pages/ObservationEntry'
import DataExport from './pages/DataExport'
import Setup from './pages/Setup'

function ProtectedLayout() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="page-content">
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/germplasm"    element={<GermplasmBrowser />} />
          <Route path="/trials"       element={<TrialManager />} />
          <Route path="/observations" element={<ObservationEntry />} />
          <Route path="/export"       element={<DataExport />} />
          <Route path="/setup"        element={<Setup />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*"    element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  )
}

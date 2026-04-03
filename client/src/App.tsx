import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { TvSearch } from './TvSearch'
import { ShowDetailsPage } from './pages/ShowDetailsPage'
import { WatchlistPage } from './pages/WatchlistPage'
import { PreferencesPage } from './pages/PreferencesPage'
import { PreferencesResultsPage } from './pages/PreferencesResultsPage'
import { ProfilePage } from './pages/ProfilePage'

function AppRoutes() {
  const { token } = useAuth()

  return (
    <Routes>
      {token ? (
        <>
          <Route path="/" element={<TvSearch />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/preferences/results" element={<PreferencesResultsPage />} />
          <Route path="/show/:id" element={<ShowDetailsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      )}
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  )
}

export default App

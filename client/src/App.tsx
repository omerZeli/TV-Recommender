import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { TvSearch } from './TvSearch'
import { ShowDetailsPage } from './pages/ShowDetailsPage'
import { WatchlistPage } from './pages/WatchlistPage'

function AppRoutes() {
  const { token } = useAuth()

  return (
    <Routes>
      {token ? (
        <>
          <Route path="/" element={<TvSearch />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/show/:id" element={<ShowDetailsPage />} />
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

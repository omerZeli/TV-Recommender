import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type NavVariant = {
  variant: 'nav'
  activePage: 'search' | 'watchlist' | 'preferences'
}

type BackVariant = {
  variant: 'back'
  onBack: () => void
  backLabel?: string
}

type AppHeaderProps = NavVariant | BackVariant

export function AppHeader(props: AppHeaderProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  if (props.variant === 'back') {
    return (
      <header className="sdp-header">
        <div className="sdp-header-content">
          <div className="sdp-header-left">
            <button className="sdp-back-btn" onClick={props.onBack} aria-label={props.backLabel ?? 'Go back'}>
              ← Back
            </button>
          </div>
          <span className="sdp-site-title">TV Recommender</span>
          <div className="sdp-user-section">
            {user && (
              <>
                <span className="sdp-user-email" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>{user.name} ✎</span>
                <button className="sdp-logout-btn" onClick={logout}>Logout</button>
              </>
            )}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="header">
      <div className="header-content">
        <h1>TV Recommender</h1>
        <div className="header-nav-actions">
          <button className={`header-nav-btn ${props.activePage === 'search' ? 'header-nav-btn--active' : ''}`} onClick={() => navigate('/')}>
            Search
          </button>
          <button className={`header-nav-btn ${props.activePage === 'watchlist' ? 'header-nav-btn--active' : ''}`} onClick={() => navigate('/watchlist')}>
            My Watchlist
          </button>
          <button className={`header-nav-btn ${props.activePage === 'preferences' ? 'header-nav-btn--active' : ''}`} onClick={() => navigate('/preferences')}>
            Preferences
          </button>
        </div>
        <div className="user-section">
          {user && (
            <>
              <span className="user-email" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>{user.name} ✎</span>
              <button className="logout-btn" onClick={logout}>Logout</button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

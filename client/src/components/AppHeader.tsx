import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import EditIcon from '@mui/icons-material/Edit'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuth } from '../context/AuthContext'
import './AppHeader.css'

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

function UserMenu() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!user) return null

  return (
    <div className="user-menu" ref={menuRef}>
      <button className="user-menu-trigger" onClick={() => setOpen((v) => !v)} aria-label="User menu">
        <AccountCircleIcon fontSize="large" />
        <span className="user-menu-name">{user.name}</span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <AccountCircleIcon sx={{ fontSize: 48 }} />
            <span className="user-menu-header-name">{user.name}</span>
          </div>
          <div className="user-menu-divider" />
          <button className="user-menu-item" onClick={() => { setOpen(false); navigate('/profile') }}>
            <EditIcon fontSize="small" />
            Edit Profile
          </button>
          <button className="user-menu-item user-menu-item--danger" onClick={() => { setOpen(false); logout() }}>
            <LogoutIcon fontSize="small" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

export function AppHeader(props: AppHeaderProps) {
  const navigate = useNavigate()

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
          <UserMenu />
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
        <UserMenu />
      </div>
    </header>
  )
}

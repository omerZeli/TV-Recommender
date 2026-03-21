import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './ShowDetailsPage.css'

type TmdbTvResult = {
  id: number
  name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
  vote_count: number
  original_name: string
  original_language: string
  origin_country: string[]
}

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500'
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280'

export function ShowDetailsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const show = (location.state as { show?: TmdbTvResult } | null)?.show

  useEffect(() => {
    // Always open details at the top of the page.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    if (!show) {
      navigate('/', { replace: true })
    }
  }, [navigate, show])

  if (!show) return null

  return (
    <div className="sdp-root">
      <header className="sdp-header">
        <div className="sdp-header-content">
          <button className="sdp-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
            ← Back to Search
          </button>
          <span className="sdp-site-title">TV Recommender</span>
          <div className="sdp-user-section">
            {user && (
              <>
                <span className="sdp-user-email">{user.email}</span>
                <button className="sdp-logout-btn" onClick={logout}>
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {show.backdrop_path && (
        <div
          className="sdp-backdrop"
          style={{ backgroundImage: `url(${TMDB_BACKDROP_BASE}${show.backdrop_path})` }}
        >
          <div className="sdp-backdrop-overlay">
            <div className="sdp-backdrop-title">
              <h1>{show.name}</h1>
              {show.original_name !== show.name && (
                <p className="sdp-backdrop-original">{show.original_name}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="sdp-main">
        {!show.backdrop_path && (
          <div className="sdp-title-fallback">
            <h1>{show.name}</h1>
            {show.original_name !== show.name && (
              <p className="sdp-title-original">{show.original_name}</p>
            )}
          </div>
        )}

        <div className="sdp-content">
          <aside className="sdp-poster">
            {show.poster_path ? (
              <img
                src={`${TMDB_POSTER_BASE}${show.poster_path}`}
                alt={`${show.name} poster`}
              />
            ) : (
              <div className="sdp-no-poster">No poster available</div>
            )}
          </aside>

          <section className="sdp-details">
            <div className="sdp-meta-grid">
              <div className="sdp-meta-item sdp-meta-item--wide">
                <span className="sdp-meta-label">First Air Date</span>
                <span className="sdp-meta-value">{show.first_air_date || 'Unknown'}</span>
              </div>

              <div className="sdp-meta-item sdp-meta-item--wide">
                <span className="sdp-meta-label">Rating</span>
                <span className="sdp-meta-value sdp-rating">
                  <span className="sdp-star">⭐</span>
                  {show.vote_average.toFixed(1)}
                  <span className="sdp-vote-count">/ 10 ({show.vote_count.toLocaleString()} votes)</span>
                </span>
              </div>

              <div className="sdp-meta-item sdp-meta-item--compact">
                <span className="sdp-meta-label">Language</span>
                <span className="sdp-meta-value">{show.original_language.toUpperCase()}</span>
              </div>

              <div className="sdp-meta-item sdp-meta-item--compact">
                <span className="sdp-meta-label">Country</span>
                <span className="sdp-meta-value">{show.origin_country.join(', ') || 'Unknown'}</span>
              </div>
            </div>

            <div className="sdp-synopsis">
              <h2>Synopsis</h2>
              <p>{show.overview || 'No overview available.'}</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

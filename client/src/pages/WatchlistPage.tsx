import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MouseEvent } from 'react'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { useAuth } from '../context/AuthContext'
import type { TmdbTvResult } from '../types/tv'
import '../TvSearch.css'
import './WatchlistPage.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

export function WatchlistPage() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<TmdbTvResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRemovingShowId, setIsRemovingShowId] = useState<number | null>(null)
  const [isMarkingWatchedShowId, setIsMarkingWatchedShowId] = useState<number | null>(null)

  useEffect(() => {
    if (!token) return

    const controller = new AbortController()

    const fetchWatchlist = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${API_BASE_URL}/watchlist`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch watchlist')
        }

        const data = (await response.json()) as TmdbTvResult[]
        setItems(data)
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
          return
        }

        setError('Could not load your watchlist. Please try again.')
        setItems([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchWatchlist().catch(() => {
      setError('Could not load your watchlist. Please try again.')
      setIsLoading(false)
    })

    return () => {
      controller.abort()
    }
  }, [token])

  const handleCardClick = (show: TmdbTvResult) => {
    navigate(`/show/${show.id}`, { state: { show } })
  }

  const handleRemoveFromWatchlist = async (
    event: MouseEvent<HTMLButtonElement>,
    showId: number,
  ) => {
    event.stopPropagation()
    if (!token) return

    setIsRemovingShowId(showId)

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${showId}`, {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to remove show from watchlist')
      }

      setItems((prevItems) => prevItems.filter((item) => item.id !== showId))
    } catch {
      setError('Could not remove this show from your watchlist. Please try again.')
    } finally {
      setIsRemovingShowId(null)
    }
  }

  const handleMarkAsWatched = async (
    event: MouseEvent<HTMLButtonElement>,
    show: TmdbTvResult,
  ) => {
    event.stopPropagation()
    if (!token) return

    setIsMarkingWatchedShowId(show.id)
    const nextWatchedState = !show.watched

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${show.id}/watched`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ watched: nextWatchedState }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark show as watched')
      }

      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === show.id
            ? {
                ...item,
                watched: nextWatchedState,
              }
            : item,
        ),
      )
    } catch {
      setError('Could not mark this show as watched. Please try again.')
    } finally {
      setIsMarkingWatchedShowId(null)
    }
  }

  return (
    <>
      <header className="header">
        <div className="header-content">
          <h1>TV Recommender</h1>
          <div className="header-nav-actions">
            <button className="header-nav-btn" onClick={() => navigate('/')}>
              Search
            </button>
            <button className="header-nav-btn header-nav-btn--active" onClick={() => navigate('/watchlist')}>
              My Watchlist
            </button>
          </div>
          <div className="user-section">
            {user && (
              <>
                <span className="user-email">{user.email}</span>
                <button className="logout-btn" onClick={logout}>
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app">
        <header className="hero">
          <h2>My Watchlist</h2>
        </header>

        {error && <p className="error">{error}</p>}

        {!error && !isLoading && (
          <p className="results-meta">
            {items.length === 0
              ? 'Your watchlist is empty. Add shows from Search or Show Details.'
              : `${items.length} show${items.length === 1 ? '' : 's'} saved`}
          </p>
        )}

        <section className="results-grid" aria-live="polite">
          {!isLoading &&
            items.map((show) => (
              <article
                className="card"
                key={show.id}
                onClick={() => handleCardClick(show)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    handleCardClick(show)
                  }
                }}
              >
                {show.poster_path ? (
                  <img
                    src={`${TMDB_IMAGE_BASE}${show.poster_path}`}
                    alt={`${show.name} poster`}
                    loading="lazy"
                  />
                ) : (
                  <div className="poster-fallback">No image</div>
                )}

                <div className="card-content">
                  <h2>{show.name}</h2>
                  <p className="meta">
                    {show.first_air_date || 'Unknown date'} • ⭐{' '}
                    {show.vote_average.toFixed(1)} ({show.vote_count})
                  </p>
                  <p className="overview">{show.overview || 'No overview available.'}</p>
                  <div className="card-actions">
                    <button
                      className="watchlist-btn watchlist-btn--remove"
                      type="button"
                      onClick={(event) => handleRemoveFromWatchlist(event, show.id)}
                      disabled={isRemovingShowId === show.id || isMarkingWatchedShowId === show.id}
                    >
                      {isRemovingShowId === show.id ? 'Removing...' : 'Remove from Watchlist'}
                    </button>
                    <button
                      className={`watch-eye-btn ${show.watched ? 'watch-eye-btn--done' : ''}`}
                      type="button"
                      aria-label={show.watched ? 'Mark as unwatched' : 'Mark as watched'}
                      title={show.watched ? 'Mark as unwatched' : 'Mark as watched'}
                      onClick={(event) => handleMarkAsWatched(event, show)}
                      disabled={isRemovingShowId === show.id || isMarkingWatchedShowId === show.id}
                    >
                      {isMarkingWatchedShowId === show.id
                        ? '...'
                        : show.watched
                          ? <VisibilityIcon fontSize="small" />
                          : <VisibilityOutlinedIcon fontSize="small" />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
        </section>
      </main>
    </>
  )
}

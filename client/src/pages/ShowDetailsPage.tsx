import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { useAuth } from '../context/AuthContext'
import type { TmdbTvResult } from '../types/tv'
import './ShowDetailsPage.css'

type TmdbVideo = {
  id: string
  key: string
  name: string
  site: string
  type: string
  official: boolean
  published_at: string
}

type TmdbVideosResponse = {
  id: number
  results: TmdbVideo[]
}

type AddWatchlistPayload = {
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

type SetWatchedPayload = {
  watched: boolean
  show?: AddWatchlistPayload
}

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500'
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

export function ShowDetailsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, token, logout } = useAuth()
  const [videos, setVideos] = useState<TmdbVideo[]>([])
  const [isLoadingVideos, setIsLoadingVideos] = useState(false)
  const [videosError, setVideosError] = useState<string | null>(null)
  const [isInWatchlist, setIsInWatchlist] = useState(false)
  const [isWatched, setIsWatched] = useState(false)
  const [isSavingToWatchlist, setIsSavingToWatchlist] = useState(false)
  const [isRemovingFromWatchlist, setIsRemovingFromWatchlist] = useState(false)
  const [isTogglingWatched, setIsTogglingWatched] = useState(false)
  const [watchlistError, setWatchlistError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!show || !token) return

    const controller = new AbortController()

    const fetchVideos = async () => {
      setIsLoadingVideos(true)
      setVideosError(null)

      try {
        const response = await fetch(`${API_BASE_URL}/tv/${show.id}/videos`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch show videos')
        }

        const data = (await response.json()) as TmdbVideosResponse
        setVideos(data.results || [])
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setVideosError('Could not load videos right now.')
      } finally {
        setIsLoadingVideos(false)
      }
    }

    fetchVideos().catch(() => {
      setVideosError('Could not load videos right now.')
      setIsLoadingVideos(false)
    })

    return () => {
      controller.abort()
    }
  }, [show, token])

  useEffect(() => {
    if (!show || !token) return

    const controller = new AbortController()

    const fetchWatchlistState = async () => {
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
        const existing = data.find((item) => item.id === show.id)
        setIsInWatchlist(Boolean(existing))
        setIsWatched(Boolean(existing?.watched))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }

    fetchWatchlistState().catch(() => {
      setIsInWatchlist(false)
      setIsWatched(false)
    })

    return () => {
      controller.abort()
    }
  }, [show, token])

  const handleAddToWatchlist = async () => {
    if (!show || !token || isInWatchlist) return

    setIsSavingToWatchlist(true)
    setWatchlistError(null)

    const payload: AddWatchlistPayload = {
      id: show.id,
      name: show.name,
      overview: show.overview ?? '',
      poster_path: show.poster_path,
      backdrop_path: show.backdrop_path,
      first_air_date: show.first_air_date ?? '',
      vote_average: show.vote_average ?? 0,
      vote_count: show.vote_count ?? 0,
      original_name: show.original_name ?? show.name,
      original_language: show.original_language ?? '',
      origin_country: Array.isArray(show.origin_country) ? show.origin_country : [],
    }

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to add to watchlist')
      }

      setIsInWatchlist(true)
    } catch {
      setWatchlistError('Could not add this show to your watchlist.')
    } finally {
      setIsSavingToWatchlist(false)
    }
  }

  const handleRemoveFromWatchlist = async () => {
    if (!show || !token || !isInWatchlist) return

    setIsRemovingFromWatchlist(true)
    setWatchlistError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${show.id}`, {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to remove from watchlist')
      }

      setIsInWatchlist(false)
      setIsWatched(false)
    } catch {
      setWatchlistError('Could not remove this show from your watchlist.')
    } finally {
      setIsRemovingFromWatchlist(false)
    }
  }

  const handleToggleWatched = async () => {
    if (!show || !token) return

    setIsTogglingWatched(true)
    setWatchlistError(null)

    const payload: AddWatchlistPayload = {
      id: show.id,
      name: show.name,
      overview: show.overview ?? '',
      poster_path: show.poster_path,
      backdrop_path: show.backdrop_path,
      first_air_date: show.first_air_date ?? '',
      vote_average: show.vote_average ?? 0,
      vote_count: show.vote_count ?? 0,
      original_name: show.original_name ?? show.name,
      original_language: show.original_language ?? '',
      origin_country: Array.isArray(show.origin_country) ? show.origin_country : [],
    }

    const nextWatchedState = !isWatched
    const watchPayload: SetWatchedPayload = {
      watched: nextWatchedState,
      show: nextWatchedState ? payload : undefined,
    }

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${show.id}/watched`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(watchPayload),
      })

      if (!response.ok) {
        throw new Error('Failed to update watched status')
      }

      setIsWatched(nextWatchedState)
      if (nextWatchedState) {
        setIsInWatchlist(true)
      }
    } catch {
      setWatchlistError('Could not update watched status for this show.')
    } finally {
      setIsTogglingWatched(false)
    }
  }

  const youtubeVideos = useMemo(() => {
    return videos
      .filter((video) => video.site === 'YouTube' && Boolean(video.key))
      .sort((a, b) => {
        const score = (video: TmdbVideo) => {
          if (video.official && video.type === 'Trailer') return 0
          if (video.type === 'Trailer') return 1
          if (video.official) return 2
          return 3
        }

        const scoreDiff = score(a) - score(b)
        if (scoreDiff !== 0) return scoreDiff

        return b.published_at.localeCompare(a.published_at)
      })
      .slice(0, 6)
  }, [videos])

  if (!show) return null

  return (
    <div className="sdp-root">
      <header className="sdp-header">
        <div className="sdp-header-content">
          <button className="sdp-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
            ← Back
          </button>
          <button className="sdp-back-btn" onClick={() => navigate('/watchlist')} aria-label="Go to watchlist">
            My Watchlist
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
            <div className="sdp-actions">
              <div className="sdp-actions-row">
                <button
                  className={`sdp-watchlist-btn ${isInWatchlist ? 'sdp-watchlist-btn--remove' : ''}`}
                  onClick={isInWatchlist ? handleRemoveFromWatchlist : handleAddToWatchlist}
                  disabled={isSavingToWatchlist || isRemovingFromWatchlist || isTogglingWatched}
                >
                  {isInWatchlist
                    ? isRemovingFromWatchlist
                      ? 'Removing...'
                      : 'Remove from Watchlist'
                    : isSavingToWatchlist
                      ? 'Adding...'
                      : 'Add to Watchlist'}
                </button>
                <button
                  className={`sdp-watch-eye-btn ${isWatched ? 'sdp-watch-eye-btn--done' : ''}`}
                  type="button"
                  aria-label={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                  title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                  onClick={handleToggleWatched}
                  disabled={isSavingToWatchlist || isRemovingFromWatchlist || isTogglingWatched}
                >
                  {isTogglingWatched
                    ? '...'
                    : isWatched
                      ? <VisibilityIcon fontSize="small" />
                      : <VisibilityOutlinedIcon fontSize="small" />}
                </button>
              </div>
              {watchlistError && <p className="sdp-watchlist-error">{watchlistError}</p>}
            </div>

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

            <section className="sdp-videos" aria-live="polite">
              <div className="sdp-videos-heading">
                <h2>Videos</h2>
                {isLoadingVideos && <span className="sdp-videos-status">Loading...</span>}
              </div>

              {videosError && <p className="sdp-videos-error">{videosError}</p>}

              {!isLoadingVideos && !videosError && youtubeVideos.length === 0 && (
                <p className="sdp-videos-empty">No videos available for this show.</p>
              )}

              {youtubeVideos.length > 0 && (
                <div className="sdp-videos-grid">
                  {youtubeVideos.map((video) => (
                    <article className="sdp-video-card" key={video.id}>
                      <div className="sdp-video-frame-wrap">
                        <iframe
                          src={`https://www.youtube.com/embed/${video.key}`}
                          title={video.name}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                      <div className="sdp-video-meta">
                        <h3>{video.name}</h3>
                        <p>
                          {video.type}
                          {video.official ? ' • Official' : ''}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>
      </main>
    </div>
  )
}

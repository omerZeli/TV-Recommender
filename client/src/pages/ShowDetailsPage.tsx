import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import countryList from 'react-select-country-list'
import { useAuth } from '../context/AuthContext'
import { AppHeader } from '../components/AppHeader'
import type { TmdbTvDetails, TmdbTvResult } from '../types/tv'
import { formatDateToDDMMYYYY } from '../utils/date'
import './ShowDetailsPage.css'

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
  const { token, user } = useAuth()
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [isInWatchlist, setIsInWatchlist] = useState(false)
  const [isWatched, setIsWatched] = useState(false)
  const [isSavingToWatchlist, setIsSavingToWatchlist] = useState(false)
  const [isRemovingFromWatchlist, setIsRemovingFromWatchlist] = useState(false)
  const [isTogglingWatched, setIsTogglingWatched] = useState(false)
  const [watchlistError, setWatchlistError] = useState<string | null>(null)

  const show = (location.state as { show?: TmdbTvResult } | null)?.show
  const [details, setDetails] = useState<TmdbTvDetails | null>(null)

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

    const fetchDetails = async () => {
      setIsLoadingDetails(true)
      try {
        const response = await fetch(`${API_BASE_URL}/tv/${show.id}`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })
        if (response.ok) {
          const data = (await response.json()) as TmdbTvDetails
          setDetails(data)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      } finally {
        setIsLoadingDetails(false)
      }
    }

    fetchDetails().catch(() => {})

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

    const src = details ?? show
    const payload: AddWatchlistPayload = {
      id: src.id,
      name: src.name,
      overview: src.overview ?? '',
      poster_path: src.poster_path,
      backdrop_path: src.backdrop_path,
      first_air_date: src.first_air_date ?? '',
      vote_average: src.vote_average ?? 0,
      vote_count: src.vote_count ?? 0,
      original_name: src.original_name ?? src.name,
      original_language: src.original_language ?? '',
      origin_country: Array.isArray(src.origin_country) ? src.origin_country : [],
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

    const src = details ?? show
    const payload: AddWatchlistPayload = {
      id: src.id,
      name: src.name,
      overview: src.overview ?? '',
      poster_path: src.poster_path,
      backdrop_path: src.backdrop_path,
      first_air_date: src.first_air_date ?? '',
      vote_average: src.vote_average ?? 0,
      vote_count: src.vote_count ?? 0,
      original_name: src.original_name ?? src.name,
      original_language: src.original_language ?? '',
      origin_country: Array.isArray(src.origin_country) ? src.origin_country : [],
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

  const userRegion = useMemo(() => {
    if (user?.country) {
      const code = countryList().getValue(user.country)
      if (code) return code.toUpperCase()
    }
    return 'US'
  }, [user?.country])

  const watchProviderInfo = useMemo(() => {
    const getProviders = (region: string) => {
      const regionData = details?.['watch/providers']?.results?.[region]
      if (!regionData) return []
      const all = [
        ...(regionData.flatrate ?? []),
        ...(regionData.free ?? []),
        ...(regionData.ads ?? []),
      ]
      return [...new Set(all.map((p) => p.provider_name))]
    }

    const userProviders = getProviders(userRegion)
    if (userProviders.length > 0) {
      return { names: userProviders, isFallback: false }
    }

    if (userRegion !== 'US') {
      const usProviders = getProviders('US')
      if (usProviders.length > 0) {
        return { names: usProviders, isFallback: true }
      }
    }

    return { names: [] as string[], isFallback: false }
  }, [details, userRegion])

  const youtubeVideos = useMemo(() => {
    const allVideos = details?.videos?.results ?? []
    return allVideos
      .filter((video) => video.site === 'YouTube' && Boolean(video.key))
      .sort((a, b) => {
        const score = (video: typeof a) => {
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
  }, [details])

  if (!show) return null

  const display = details ?? show

  return (
    <div className="sdp-root">
      <AppHeader variant="back" onBack={() => navigate(-1)} />

      {display.backdrop_path && (
        <div
          className="sdp-backdrop"
          style={{ backgroundImage: `url(${TMDB_BACKDROP_BASE}${display.backdrop_path})` }}
        >
          <div className="sdp-backdrop-overlay">
            <div className="sdp-backdrop-title">
              <h1>{display.name}</h1>
              {display.original_name !== display.name && (
                <p className="sdp-backdrop-original">{display.original_name}</p>
              )}
              {details?.tagline && (
                <p className="sdp-backdrop-tagline">&ldquo;{details.tagline}&rdquo;</p>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="sdp-main">
        {!display.backdrop_path && (
          <div className="sdp-title-fallback">
            <h1>{display.name}</h1>
            {display.original_name !== display.name && (
              <p className="sdp-title-original">{display.original_name}</p>
            )}
            {details?.tagline && (
              <p className="sdp-tagline">&ldquo;{details.tagline}&rdquo;</p>
            )}
          </div>
        )}

        <div className="sdp-content">
          <aside className="sdp-poster">
            {display.poster_path ? (
              <img
                src={`${TMDB_POSTER_BASE}${display.poster_path}`}
                alt={`${display.name} poster`}
              />
            ) : (
              <div className="sdp-no-poster">No poster available</div>
            )}
          </aside>

          <section className="sdp-details">
            {isLoadingDetails && !details && (
              <p className="sdp-details-loading">Loading details...</p>
            )}

            <div className="sdp-actions">
              <div className="sdp-actions-row">
                {details?.genres && details.genres.length > 0 && (
                  <div className="sdp-genres">
                    {details.genres.map((g) => (
                      <span key={g.id} className="sdp-genre-tag">{g.name}</span>
                    ))}
                  </div>
                )}
                <div className="sdp-actions-btns">
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
              </div>
              {watchlistError && <p className="sdp-watchlist-error">{watchlistError}</p>}
            </div>

            <div className="sdp-meta-grid sdp-meta-grid--top">
              <div className="sdp-meta-item">
                <span className="sdp-meta-label">First Air Date</span>
                <span className="sdp-meta-value">{formatDateToDDMMYYYY(display.first_air_date) || 'Unknown'}</span>
              </div>

              {details?.last_air_date && (
                <div className="sdp-meta-item">
                  <span className="sdp-meta-label">Last Air Date</span>
                  <span className="sdp-meta-value">{formatDateToDDMMYYYY(details.last_air_date)}</span>
                </div>
              )}

              <div className="sdp-meta-item">
                <span className="sdp-meta-label">Rating</span>
                <span className="sdp-meta-value sdp-rating">
                  <span className="sdp-star">⭐</span>
                  {display.vote_average.toFixed(1)}
                  <span className="sdp-vote-count">/ 10</span>
                </span>
              </div>

              {details?.networks && details.networks.length > 0 && (
                <div className="sdp-meta-item">
                  <span className="sdp-meta-label">Network</span>
                  <span className="sdp-meta-value">{details.networks.map((n) => n.name).join(', ')}</span>
                </div>
              )}

              {watchProviderInfo.names.length > 0 && (
                <div className="sdp-meta-item">
                  <span className="sdp-meta-label">Watch On</span>
                  <span className="sdp-meta-value">
                    {watchProviderInfo.names[0]}
                    {watchProviderInfo.isFallback && (
                      <span style={{ fontSize: '0.75em', color: '#888', marginLeft: '4px' }}>(US)</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="sdp-meta-grid">
              <div className="sdp-meta-item sdp-meta-item--compact">
                <span className="sdp-meta-label">Language</span>
                <span className="sdp-meta-value">{display.original_language.toUpperCase()}</span>
              </div>

              <div className="sdp-meta-item sdp-meta-item--compact">
                <span className="sdp-meta-label">Country</span>
                <span className="sdp-meta-value">{display.origin_country.join(', ') || 'Unknown'}</span>
              </div>

              {details?.status && (
                <div className="sdp-meta-item sdp-meta-item--compact">
                  <span className="sdp-meta-label">Status</span>
                  <span className="sdp-meta-value">{details.status}</span>
                </div>
              )}

              {details?.type && (
                <div className="sdp-meta-item sdp-meta-item--compact">
                  <span className="sdp-meta-label">Type</span>
                  <span className="sdp-meta-value">{details.type}</span>
                </div>
              )}

              {details && (
                <div className="sdp-meta-item sdp-meta-item--compact">
                  <span className="sdp-meta-label">Seasons</span>
                  <span className="sdp-meta-value">{details.number_of_seasons}</span>
                </div>
              )}

              {details && (
                <div className="sdp-meta-item sdp-meta-item--compact">
                  <span className="sdp-meta-label">Episodes</span>
                  <span className="sdp-meta-value">{details.number_of_episodes}</span>
                </div>
              )}
            </div>

            <div className="sdp-synopsis">
              <h2>Overview</h2>
              <p>{display.overview || 'No overview available.'}</p>
              {details?.keywords?.results && details.keywords.results.length > 0 && (
                <div className="sdp-keywords">
                  {details.keywords.results.map((kw) => (
                    <span key={kw.id} className="sdp-keyword-tag">{kw.name}</span>
                  ))}
                </div>
              )}
            </div>

            {details?.aggregate_credits?.cast && details.aggregate_credits.cast.length > 0 && (
              <section className="sdp-cast">
                <h2>Series Cast</h2>
                <div className="sdp-cast-grid">
                  {details.aggregate_credits.cast.slice(0, 12).map((actor) => (
                    <div key={actor.id} className="sdp-cast-card">
                      {actor.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                          alt={actor.name}
                          className="sdp-cast-photo"
                          loading="lazy"
                        />
                      ) : (
                        <div className="sdp-cast-photo sdp-cast-photo--empty" aria-hidden="true" />
                      )}
                      <div className="sdp-cast-info">
                        <span className="sdp-cast-name">{actor.name}</span>
                        <span className="sdp-cast-character">
                          {actor.roles.map((r) => r.character).filter(Boolean).join(' / ') || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="sdp-videos" aria-live="polite">
              <div className="sdp-videos-heading">
                <h2>Videos</h2>
                {isLoadingDetails && !details && <span className="sdp-videos-status">Loading...</span>}
              </div>

              {!isLoadingDetails && youtubeVideos.length === 0 && (
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

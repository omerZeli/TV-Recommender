import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MouseEvent } from 'react'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { useAuth } from '../context/AuthContext'
import { AppHeader } from '../components/AppHeader'
import type { TmdbTvResult } from '../types/tv'
import { formatDateToDDMMYYYY } from '../utils/date'
import { PREF_STORAGE_KEY } from './PreferencesPage'
import '../TvSearch.css'
import './PreferencesPage.css'
import './ShowDetailsPage.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

export function PreferencesResultsPage() {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [recommendations, setRecommendations] = useState<TmdbTvResult[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [watchlistIds, setWatchlistIds] = useState<number[]>([])
  const [watchedShowIds, setWatchedShowIds] = useState<number[]>([])
  const [isAddingShowId, setIsAddingShowId] = useState<number | null>(null)
  const [isRemovingShowId, setIsRemovingShowId] = useState<number | null>(null)
  const [isMarkingWatchedShowId, setIsMarkingWatchedShowId] = useState<number | null>(null)
  const [isResearching, setIsResearching] = useState(false)

  // Load results from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREF_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setRecommendations(Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
        setSearchQuery(typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '')
      }
    } catch {
      // ignore
    }
  }, [])

  // Fetch watchlist on load
  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/watchlist`, {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data)) {
            setWatchlistIds(data.map((item: any) => item.id))
            setWatchedShowIds(data.filter((item: any) => item.watched).map((item: any) => item.id))
          }
        }
      } catch (err) {
        console.error('Failed to fetch watchlist:', err)
      }
    }

    if (token) {
      fetchWatchlist()
    }
  }, [token])

  const handleSearchAgain = async () => {
    setIsResearching(true)
    try {
      const raw = sessionStorage.getItem(PREF_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const query = parsed.lastSearchedQuery || parsed.searchQuery || ''
      const refIds: number[] = parsed.lastSearchedReferenceIds || parsed.selectedReferenceIds || []

      // We need reference show names for the API — fetch watchlist to resolve them
      let referenceShows: { tmdb_id: number; name: string }[] | undefined
      if (refIds.length > 0 && token) {
        const wlRes = await fetch(`${API_BASE_URL}/watchlist`, {
          headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
        })
        if (wlRes.ok) {
          const wlData = await wlRes.json()
          if (Array.isArray(wlData)) {
            referenceShows = wlData
              .filter((item: any) => refIds.includes(item.id))
              .map((item: any) => ({ tmdb_id: item.id, name: item.name }))
          }
        }
      }

      const response = await fetch(`${API_BASE_URL}/tv/discover-natural`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query,
          watchRegion: parsed.watchRegion || 'US',
          referenceShows: referenceShows && referenceShows.length > 0 ? referenceShows : undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const results: TmdbTvResult[] = data.results || []
        setRecommendations(results)
        sessionStorage.setItem(
          PREF_STORAGE_KEY,
          JSON.stringify({
            ...parsed,
            recommendations: results,
            hasSearched: true,
          }),
        )
      }
    } catch (err) {
      console.error('Failed to re-search:', err)
    } finally {
      setIsResearching(false)
    }
  }

  const handleAddToWatchlist = async (event: MouseEvent<HTMLButtonElement>, show: TmdbTvResult) => {
    event.stopPropagation()
    setIsAddingShowId(show.id)

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: show.id,
          name: show.name,
          overview: show.overview,
          poster_path: show.poster_path,
          backdrop_path: show.backdrop_path,
          first_air_date: show.first_air_date,
          vote_average: show.vote_average,
          vote_count: show.vote_count,
          original_name: show.original_name,
          original_language: show.original_language,
          origin_country: show.origin_country,
        }),
      })

      if (response.ok) {
        setWatchlistIds((prev) => [...prev, show.id])
      }
    } catch (err) {
      console.error('Failed to add to watchlist:', err)
    } finally {
      setIsAddingShowId(null)
    }
  }

  const handleRemoveFromWatchlist = async (event: MouseEvent<HTMLButtonElement>, showId: number) => {
    event.stopPropagation()
    setIsRemovingShowId(showId)

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${showId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        setWatchlistIds((prev) => prev.filter((id) => id !== showId))
        setWatchedShowIds((prev) => prev.filter((id) => id !== showId))
      }
    } catch (err) {
      console.error('Failed to remove from watchlist:', err)
    } finally {
      setIsRemovingShowId(null)
    }
  }

  const handleMarkAsWatched = async (event: MouseEvent<HTMLButtonElement>, show: TmdbTvResult) => {
    event.stopPropagation()
    setIsMarkingWatchedShowId(show.id)

    const newWatchedState = !watchedShowIds.includes(show.id)

    try {
      const response = await fetch(`${API_BASE_URL}/watchlist/${show.id}/watched`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          watched: newWatchedState,
          show: newWatchedState
            ? undefined
            : {
                id: show.id,
                name: show.name,
                overview: show.overview,
                poster_path: show.poster_path,
                backdrop_path: show.backdrop_path,
                first_air_date: show.first_air_date,
                vote_average: show.vote_average,
                vote_count: show.vote_count,
                original_name: show.original_name,
                original_language: show.original_language,
                origin_country: show.origin_country,
              },
        }),
      })

      if (response.ok) {
        if (newWatchedState) {
          setWatchedShowIds((prev) => [...prev, show.id])
        } else {
          setWatchedShowIds((prev) => prev.filter((id) => id !== show.id))
        }
      }
    } catch (err) {
      console.error('Failed to mark as watched:', err)
    } finally {
      setIsMarkingWatchedShowId(null)
    }
  }

  const handleCardClick = (show: TmdbTvResult) => {
    navigate(`/show/${show.id}`, { state: { show } })
  }

  return (
    <div className="sdp-root">
      <AppHeader variant="back" onBack={() => navigate('/preferences')} backLabel="Back to Preferences" />

      <main className="app">
        <header className="hero pref-results-hero">
          <h2>Recommendation Results</h2>
          {searchQuery.trim() && (
            <div className="pref-results-subtitle-row">
              <p>Results for "{searchQuery.trim()}"</p>
              <button
                type="button"
                className="pref-research-btn"
                onClick={handleSearchAgain}
                disabled={isResearching}
                aria-label="Search again"
                title="Search again with same criteria"
              >
                <AutorenewIcon className={isResearching ? 'spin' : ''} fontSize="small" />
              </button>
            </div>
          )}
        </header>

        {recommendations.length > 0 ? (
          <section className="results-section">
            <div className="pref-results-meta-row">
            </div>
            <div className="results-grid" aria-live="polite">
              {recommendations.map((show) => (
                <article
                  key={show.id}
                  className="card"
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
                      {formatDateToDDMMYYYY(show.first_air_date) || 'Unknown date'} • ⭐{' '}
                      {show.vote_average.toFixed(1)}
                    </p>
                    <p className="overview">{show.overview || 'No overview available.'}</p>
                    <div className="card-actions">
                      <button
                        className={`watchlist-btn ${watchlistIds.includes(show.id) ? 'watchlist-btn--remove' : ''}`}
                        type="button"
                        onClick={(e) =>
                          watchlistIds.includes(show.id)
                            ? handleRemoveFromWatchlist(e, show.id)
                            : handleAddToWatchlist(e, show)
                        }
                        disabled={
                          isAddingShowId === show.id ||
                          isRemovingShowId === show.id ||
                          isMarkingWatchedShowId === show.id
                        }
                      >
                        {watchlistIds.includes(show.id)
                          ? isRemovingShowId === show.id
                            ? 'Removing...'
                            : 'Remove from Watchlist'
                          : isAddingShowId === show.id
                            ? 'Adding...'
                            : 'Add to Watchlist'}
                      </button>
                      <button
                        className={`watch-eye-btn ${watchedShowIds.includes(show.id) ? 'watch-eye-btn--done' : ''}`}
                        type="button"
                        aria-label={watchedShowIds.includes(show.id) ? 'Mark as unwatched' : 'Mark as watched'}
                        title={watchedShowIds.includes(show.id) ? 'Mark as unwatched' : 'Mark as watched'}
                        onClick={(e) => handleMarkAsWatched(e, show)}
                        disabled={
                          isMarkingWatchedShowId === show.id ||
                          isAddingShowId === show.id ||
                          isRemovingShowId === show.id
                        }
                      >
                        {isMarkingWatchedShowId === show.id
                          ? '...'
                          : watchedShowIds.includes(show.id)
                            ? <VisibilityIcon fontSize="small" />
                            : <VisibilityOutlinedIcon fontSize="small" />}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p className="results-meta">No results found. Go back and try a different search.</p>
        )}
      </main>
    </div>
  )
}

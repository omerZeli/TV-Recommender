import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormEvent, MouseEvent } from 'react'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { useAuth } from '../context/AuthContext'
import type { TmdbTvResult } from '../types/tv'
import { formatDateToDDMMYYYY } from '../utils/date'
import '../TvSearch.css'
import './PreferencesPage.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

const PREF_STORAGE_KEY = 'pref-search-state'

const isReloadNavigation = (): boolean => {
  const navigationEntries = window.performance.getEntriesByType('navigation')
  const navigationEntry = navigationEntries[0] as PerformanceNavigationTiming | undefined
  return navigationEntry?.type === 'reload'
}

let shouldResetPrefStateOnFirstMount = isReloadNavigation()

const getInitialPrefState = (): { searchQuery: string; hasSearched: boolean; recommendations: TmdbTvResult[] } => {
  if (shouldResetPrefStateOnFirstMount) {
    shouldResetPrefStateOnFirstMount = false
    sessionStorage.removeItem(PREF_STORAGE_KEY)
    return { searchQuery: '', hasSearched: false, recommendations: [] }
  }

  try {
    const raw = sessionStorage.getItem(PREF_STORAGE_KEY)
    if (!raw) return { searchQuery: '', hasSearched: false, recommendations: [] }
    const parsed = JSON.parse(raw)
    return {
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
      hasSearched: parsed.hasSearched === true,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    }
  } catch {
    return { searchQuery: '', hasSearched: false, recommendations: [] }
  }
}

export function PreferencesPage() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const initialPrefState = getInitialPrefState()

  const [searchQuery, setSearchQuery] = useState(initialPrefState.searchQuery)
  const [isLoadingSearch, setIsLoadingSearch] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(initialPrefState.hasSearched)
  const [recommendations, setRecommendations] = useState<TmdbTvResult[]>(initialPrefState.recommendations)
  const [watchlistIds, setWatchlistIds] = useState<number[]>([])
  const [watchedShowIds, setWatchedShowIds] = useState<number[]>([])
  const [isAddingShowId, setIsAddingShowId] = useState<number | null>(null)
  const [isRemovingShowId, setIsRemovingShowId] = useState<number | null>(null)
  const [isMarkingWatchedShowId, setIsMarkingWatchedShowId] = useState<number | null>(null)

  // Watchlist picker state
  const [watchlistItems, setWatchlistItems] = useState<TmdbTvResult[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<number>>(new Set())
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  // Persist search state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(PREF_STORAGE_KEY, JSON.stringify({ searchQuery, hasSearched, recommendations }))
  }, [searchQuery, hasSearched, recommendations])

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
            setWatchlistItems(data)
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

  const handleSearchWithNaturalLanguage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setHasSearched(true)

    if (searchQuery.trim().length < 10 && selectedReferenceIds.size === 0) {
      setSearchError('Please enter a search query or select reference shows from your watchlist')
      return
    }

    setIsLoadingSearch(true)
    setSearchError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/tv/discover-natural`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          referenceShows: selectedReferenceIds.size > 0
            ? watchlistItems
                .filter((item) => selectedReferenceIds.has(item.id))
                .map((item) => ({
                  tmdb_id: item.id,
                  name: item.name,
                }))
            : undefined,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.results || [])
        console.log('Found', data.results?.length || 0, 'shows matching your natural language query')
      } else {
        setSearchError('Failed to process your search. Please try again with different wording.')
        console.error('API response:', response.status, response.statusText)
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err)
      setSearchError('An error occurred while processing your search.')
    } finally {
      setIsLoadingSearch(false)
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

  const toggleReferenceShow = (id: number) => {
    setSelectedReferenceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
            <button className="header-nav-btn" onClick={() => navigate('/watchlist')}>
              My Watchlist
            </button>
            <button className="header-nav-btn header-nav-btn--active" onClick={() => navigate('/preferences')}>
              Preferences
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
          <h2>Describe Your TV Preferences</h2>
          <p>Use natural language and we will find matching shows.</p>
        </header>

        <form className="search-bar" onSubmit={handleSearchWithNaturalLanguage}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Natural language TV preferences"
          />
          <button type="submit" disabled={isLoadingSearch}>
            {isLoadingSearch ? 'Searching...' : 'Search'}
          </button>
        </form>

        {watchlistItems.length > 0 && (
          <div className="reference-picker-trigger" style={{ padding: '0 2rem', marginBottom: '1rem' }}>
            <button
              type="button"
              className="reference-picker-btn"
              onClick={() => setIsPickerOpen(true)}
            >
              {selectedReferenceIds.size > 0
                ? `${selectedReferenceIds.size} show${selectedReferenceIds.size > 1 ? 's' : ''} selected as reference`
                : 'Select shows from watchlist as reference'}
            </button>
          </div>
        )}

        {isPickerOpen && (
          <div className="picker-overlay" onClick={() => setIsPickerOpen(false)}>
            <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
              <div className="picker-header">
                <h3>Select Reference Shows</h3>
                <button type="button" className="picker-close" onClick={() => setIsPickerOpen(false)}>✕</button>
              </div>
              <p className="picker-description">Pick shows the AI should use to understand your taste.</p>
              <div className="picker-grid">
                {watchlistItems.map((item) => {
                  const isSelected = selectedReferenceIds.has(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`picker-card ${isSelected ? 'picker-card--selected' : ''}`}
                      onClick={() => toggleReferenceShow(item.id)}
                    >
                      {item.poster_path ? (
                        <img src={`${TMDB_IMAGE_BASE}${item.poster_path}`} alt={item.name} loading="lazy" />
                      ) : (
                        <div className="picker-poster-fallback">No image</div>
                      )}
                      <span className="picker-card-name">{item.name}</span>
                      {isSelected && <span className="picker-check">✓</span>}
                    </button>
                  )
                })}
              </div>
              <div className="picker-footer">
                <button type="button" className="picker-done-btn" onClick={() => setIsPickerOpen(false)}>
                  Done {selectedReferenceIds.size > 0 && `(${selectedReferenceIds.size})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {searchError && <p className="error">{searchError}</p>}

        {hasSearched && searchQuery.trim() && !searchError && (
          <p className="results-meta">Showing results for "{searchQuery.trim()}"</p>
        )}

        {recommendations.length > 0 && (
          <section className="results-section">
            <p className="results-meta">Found {recommendations.length} shows</p>
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
        )}

        {hasSearched && !isLoadingSearch && recommendations.length === 0 && searchQuery.trim() && !searchError && (
          <p className="results-meta">No shows found. Try refining your search.</p>
        )}
      </main>
    </>
  )
}

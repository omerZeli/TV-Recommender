import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormEvent, MouseEvent } from 'react'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import './TvSearch.css'
import { useAuth } from './context/AuthContext'
import type { TmdbTvResult } from './types/tv'
import { formatDateToDDMMYYYY } from './utils/date'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

type TmdbSearchResponse = {
  page: number
  results: TmdbTvResult[]
  total_pages: number
  total_results: number
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

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'
const SEARCH_STATE_STORAGE_KEY = 'tv-search-state'
const DEFAULT_SEARCH_STATE: TvSearchStoredState = {
  query: '',
  searchTerm: '',
  results: [],
  error: null,
}

type TvSearchStoredState = {
  query: string
  searchTerm: string
  results: TmdbTvResult[]
  error: string | null
}

const isReloadNavigation = (): boolean => {
  const navigationEntries = window.performance.getEntriesByType('navigation')
  const navigationEntry = navigationEntries[0] as PerformanceNavigationTiming | undefined
  return navigationEntry?.type === 'reload'
}

let shouldResetStateOnFirstMount = isReloadNavigation()

const getInitialSearchState = (): TvSearchStoredState => {
  if (shouldResetStateOnFirstMount) {
    shouldResetStateOnFirstMount = false
    sessionStorage.removeItem(SEARCH_STATE_STORAGE_KEY)
    return DEFAULT_SEARCH_STATE
  }

  try {
    const raw = sessionStorage.getItem(SEARCH_STATE_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_SEARCH_STATE
    }

    const parsed = JSON.parse(raw) as Partial<TvSearchStoredState>
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      searchTerm: typeof parsed.searchTerm === 'string' ? parsed.searchTerm : '',
      results: Array.isArray(parsed.results) ? parsed.results : [],
      error: typeof parsed.error === 'string' || parsed.error === null ? parsed.error : null,
    }
  } catch {
    return DEFAULT_SEARCH_STATE
  }
}

export function TvSearch() {
  const initialState = getInitialSearchState()
  const [query, setQuery] = useState(initialState.query)
  const [searchTerm, setSearchTerm] = useState(initialState.searchTerm)
  const [results, setResults] = useState<TmdbTvResult[]>(initialState.results)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialState.error)
  const [watchlistIds, setWatchlistIds] = useState<number[]>([])
  const [watchedShowIds, setWatchedShowIds] = useState<number[]>([])
  const [isAddingShowId, setIsAddingShowId] = useState<number | null>(null)
  const [isRemovingShowId, setIsRemovingShowId] = useState<number | null>(null)
  const [isMarkingWatchedShowId, setIsMarkingWatchedShowId] = useState<number | null>(null)
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) return

    const controller = new AbortController()

    const fetchWatchlist = async () => {
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
        setWatchlistIds(data.map((item) => item.id))
        setWatchedShowIds(data.filter((item) => item.watched).map((item) => item.id))
      } catch (watchlistError) {
        if (watchlistError instanceof DOMException && watchlistError.name === 'AbortError') {
          return
        }
      }
    }

    fetchWatchlist().catch(() => {
      setWatchlistIds([])
      setWatchedShowIds([])
    })

    return () => {
      controller.abort()
    }
  }, [token])

  useEffect(() => {
    const stateToPersist: TvSearchStoredState = {
      query,
      searchTerm,
      results,
      error,
    }

    sessionStorage.setItem(SEARCH_STATE_STORAGE_KEY, JSON.stringify(stateToPersist))
  }, [query, searchTerm, results, error])

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmed = query.trim()
    if (!trimmed) {
      setError('Please enter a TV show name to search.')
      setResults([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const url = `${API_BASE_URL}/tv/search?query=${encodeURIComponent(trimmed)}`
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }

      const response = await fetch(url, options)

      if (!response.ok) {
        throw new Error('Search failed. Please try again.')
      }

      const data = (await response.json()) as TmdbSearchResponse
      setResults(data.results)
      setSearchTerm(trimmed)
    } catch {
      setError('Could not fetch results. Please try again.')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCardClick = (show: TmdbTvResult) => {
    navigate(`/show/${show.id}`, { state: { show } })
  }

  const handleAddToWatchlist = async (
    event: MouseEvent<HTMLButtonElement>,
    show: TmdbTvResult,
  ) => {
    event.stopPropagation()

    if (!token || watchlistIds.includes(show.id)) {
      return
    }

    setIsAddingShowId(show.id)

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
        throw new Error('Failed to add show to watchlist')
      }

      setWatchlistIds((prevIds) => {
        if (prevIds.includes(show.id)) {
          return prevIds
        }

        return [...prevIds, show.id]
      })
    } catch {
      setError('Could not add this show to your watchlist. Please try again.')
    } finally {
      setIsAddingShowId(null)
    }
  }

  const handleRemoveFromWatchlist = async (
    event: MouseEvent<HTMLButtonElement>,
    showId: number,
  ) => {
    event.stopPropagation()

    if (!token || !watchlistIds.includes(showId)) {
      return
    }

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

      setWatchlistIds((prevIds) => prevIds.filter((id) => id !== showId))
      setWatchedShowIds((prevIds) => prevIds.filter((id) => id !== showId))
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

    if (!token) {
      return
    }

    setIsMarkingWatchedShowId(show.id)
    const isCurrentlyWatched = watchedShowIds.includes(show.id)

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

    const watchPayload: SetWatchedPayload = {
      watched: !isCurrentlyWatched,
      show: isCurrentlyWatched ? undefined : payload,
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
        throw new Error('Failed to mark show as watched')
      }

      if (!isCurrentlyWatched) {
        setWatchlistIds((prevIds) => (prevIds.includes(show.id) ? prevIds : [...prevIds, show.id]))
        setWatchedShowIds((prevIds) => (prevIds.includes(show.id) ? prevIds : [...prevIds, show.id]))
      } else {
        setWatchedShowIds((prevIds) => prevIds.filter((id) => id !== show.id))
      }
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
            <button className="header-nav-btn header-nav-btn--active" onClick={() => navigate('/')}>
              Search
            </button>
            <button className="header-nav-btn" onClick={() => navigate('/watchlist')}>
              My Watchlist
            </button>
            <button className="header-nav-btn" onClick={() => navigate('/preferences')}>
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
        <h2>Find Your Next Favorite Show</h2>
      </header>

      <form className="search-bar" onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search TV shows"
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {searchTerm && !error && (
        <p className="results-meta">Showing results for "{searchTerm}"</p>
      )}

      <section className="results-grid" aria-live="polite">
        {results.map((show) => (
          <article 
            className="card" 
            key={show.id}
            onClick={() => handleCardClick(show)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
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
                  onClick={(event) =>
                    watchlistIds.includes(show.id)
                      ? handleRemoveFromWatchlist(event, show.id)
                      : handleAddToWatchlist(event, show)
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
                  onClick={(event) => handleMarkAsWatched(event, show)}
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
      </section>
      </main>
    </>
  )
}

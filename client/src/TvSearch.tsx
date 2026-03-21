import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import './TvSearch.css'
import { useAuth } from './context/AuthContext'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

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

type TmdbSearchResponse = {
  page: number
  results: TmdbTvResult[]
  total_pages: number
  total_results: number
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
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

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

  return (
    <>
      <header className="header">
        <div className="header-content">
          <h1>TV Recommender</h1>
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
          placeholder="Search TV shows, e.g. Gossip Girl"
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
                {show.first_air_date || 'Unknown date'} • ⭐{' '}
                {show.vote_average.toFixed(1)} ({show.vote_count})
              </p>
              <p className="overview">{show.overview || 'No overview available.'}</p>
            </div>
          </article>
        ))}
      </section>
      </main>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import type { TmdbTvResult } from '../types/tv'
import '../TvSearch.css'
import './PreferencesPage.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

export const PREF_STORAGE_KEY = 'pref-search-state'

const isReloadNavigation = (): boolean => {
  const navigationEntries = window.performance.getEntriesByType('navigation')
  const navigationEntry = navigationEntries[0] as PerformanceNavigationTiming | undefined
  return navigationEntry?.type === 'reload'
}

let shouldResetPrefStateOnFirstMount = isReloadNavigation()

export const getInitialPrefState = (): { searchQuery: string; hasSearched: boolean; recommendations: TmdbTvResult[]; selectedReferenceIds: number[] } => {
  if (shouldResetPrefStateOnFirstMount) {
    shouldResetPrefStateOnFirstMount = false
    sessionStorage.removeItem(PREF_STORAGE_KEY)
    return { searchQuery: '', hasSearched: false, recommendations: [], selectedReferenceIds: [] }
  }

  try {
    const raw = sessionStorage.getItem(PREF_STORAGE_KEY)
    if (!raw) return { searchQuery: '', hasSearched: false, recommendations: [], selectedReferenceIds: [] }
    const parsed = JSON.parse(raw)
    return {
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
      hasSearched: parsed.hasSearched === true,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      selectedReferenceIds: Array.isArray(parsed.selectedReferenceIds) ? parsed.selectedReferenceIds : [],
    }
  } catch {
    return { searchQuery: '', hasSearched: false, recommendations: [], selectedReferenceIds: [] }
  }
}

export function PreferencesPage() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const initialPrefState = getInitialPrefState()

  const [searchQuery, setSearchQuery] = useState(initialPrefState.searchQuery)
  const [isLoadingSearch, setIsLoadingSearch] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Watchlist picker state
  const [watchlistItems, setWatchlistItems] = useState<TmdbTvResult[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<number>>(
    new Set(initialPrefState.selectedReferenceIds),
  )
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  // Persist search query and selected references to sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREF_STORAGE_KEY)
      const existing = raw ? JSON.parse(raw) : {}
      sessionStorage.setItem(
        PREF_STORAGE_KEY,
        JSON.stringify({
          ...existing,
          searchQuery,
          selectedReferenceIds: Array.from(selectedReferenceIds),
        }),
      )
    } catch {
      // ignore
    }
  }, [searchQuery, selectedReferenceIds])

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

    if (searchQuery.trim().length < 10 && selectedReferenceIds.size === 0) {
      setSearchError('Please enter a search query or select reference shows from your watchlist')
      return
    }

    // Check if query and references are unchanged from last search — if so, show cached results
    if (initialPrefState.recommendations.length > 0) {
      const currentRefIds = Array.from(selectedReferenceIds).sort((a, b) => a - b)
      const lastRefIds = [...initialPrefState.selectedReferenceIds].sort((a, b) => a - b)
      const sameQuery = searchQuery === initialPrefState.searchQuery
      const sameRefs =
        currentRefIds.length === lastRefIds.length &&
        currentRefIds.every((id, i) => id === lastRefIds[i])

      if (sameQuery && sameRefs) {
        navigate('/preferences/results')
        return
      }
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
        const results: TmdbTvResult[] = data.results || []
        // Save to sessionStorage and navigate to results page
        sessionStorage.setItem(
          PREF_STORAGE_KEY,
          JSON.stringify({
            searchQuery,
            hasSearched: true,
            recommendations: results,
            selectedReferenceIds: Array.from(selectedReferenceIds),
          }),
        )
        navigate('/preferences/results')
      } else {
        setSearchError('Failed to process your search. Please try again with different wording.')
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err)
      setSearchError('An error occurred while processing your search.')
    } finally {
      setIsLoadingSearch(false)
    }
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
      </main>
    </>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

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

function App() {
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<TmdbTvResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmed = query.trim()
    if (!trimmed) {
      setError('Please enter a TV show name to search.')
      setResults([])
      return
    }

    const bearerToken = import.meta.env.VITE_TMDB_BEARER_TOKEN
    if (!bearerToken) {
      setError('Missing VITE_TMDB_BEARER_TOKEN. Add it to your .env file.')
      setResults([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const url = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(trimmed)}&include_adult=true&language=en-US&page=1`
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
      }

      const response = await fetch(url, options)

      if (!response.ok) {
        throw new Error('TMDB search failed. Please try again.')
      }

      const data = (await response.json()) as TmdbSearchResponse
      setResults(data.results)
      setSearchTerm(trimmed)
    } catch {
      setError('Could not fetch results from TMDB. Please try again.')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <h1>TMDB TV Search</h1>
        <p>Search shows and browse results in card view.</p>
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
          <article className="card" key={show.id}>
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
  )
}

export default App

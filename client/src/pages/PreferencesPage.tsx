import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { useAuth } from '../context/AuthContext'
import type { TvPreferences, WatchProvider, Company, TmdbTvResult } from '../types/tv'
import { formatDateToDDMMYYYY } from '../utils/date'
import '../TvSearch.css'
import './PreferencesPage.css'

// Status codes from TMDB
const STATUS_OPTIONS = [
  { id: 0, name: 'Returning Series' },
  { id: 1, name: 'Planned' },
  { id: 2, name: 'In Production' },
  { id: 3, name: 'Ended' },
  { id: 4, name: 'Cancelled' },
  { id: 5, name: 'Pilot' },
]

// Type codes from TMDB
const TYPE_OPTIONS = [
  { id: 0, name: 'Documentary' },
  { id: 1, name: 'News' },
  { id: 2, name: 'Miniseries' },
  { id: 3, name: 'Reality' },
  { id: 4, name: 'Scripted' },
  { id: 5, name: 'Talk Show' },
  { id: 6, name: 'Video' },
]

// Common languages
const LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'he', name: 'Hebrew' },
  { code: 'zh', name: 'Chinese' },
]

// Common countries (ISO 3166-1)
const COUNTRY_OPTIONS = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'SE', name: 'Sweden' },
  { code: 'IL', name: 'Israel' },
]

const WATCH_REGION_OPTIONS = COUNTRY_OPTIONS.filter(
  (country) => country.code === 'US' || country.code === 'IL',
)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'
const DEFAULT_PREFERENCES: TvPreferences = {
  originCountries: [],
  watchRegions: [],
  originalLanguages: [],
  companies: [],
  status: [],
  type: [],
  watchProviders: [],
}

export function PreferencesPage() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [preferences, setPreferences] = useState<TvPreferences>(DEFAULT_PREFERENCES)

  const [watchProviders, setWatchProviders] = useState<WatchProvider[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Recommendations state
  const [recommendations, setRecommendations] = useState<TmdbTvResult[]>([])
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false)
  const [recommendationError, setRecommendationError] = useState<string | null>(null)
  const [watchlistIds, setWatchlistIds] = useState<number[]>([])
  const [watchedShowIds, setWatchedShowIds] = useState<number[]>([])
  const [isAddingShowId, setIsAddingShowId] = useState<number | null>(null)
  const [isRemovingShowId, setIsRemovingShowId] = useState<number | null>(null)
  const [isMarkingWatchedShowId, setIsMarkingWatchedShowId] = useState<number | null>(null)

  const getDisplayNames = () => {
    const statusNames = preferences.status.map((id) => {
      const status = STATUS_OPTIONS.find((s) => s.id === id)
      return status ? `${id} (${status.name})` : id
    })

    const typeNames = preferences.type.map((id) => {
      const type = TYPE_OPTIONS.find((t) => t.id === id)
      return type ? `${id} (${type.name})` : id
    })

    const languageNames = preferences.originalLanguages.map((code) => {
      const lang = LANGUAGE_OPTIONS.find((l) => l.code === code)
      return lang ? `${code} (${lang.name})` : code
    })

    const countryNames = preferences.originCountries.map((code) => {
      const country = COUNTRY_OPTIONS.find((c) => c.code === code)
      return country ? `${code} (${country.name})` : code
    })

    const watchRegionNames = preferences.watchRegions.map((code) => {
      const country = COUNTRY_OPTIONS.find((c) => c.code === code)
      return country ? `${code} (${country.name})` : code
    })

    const providerNames = preferences.watchProviders.map((id) => {
      const provider = watchProviders.find((p) => p.provider_id === id)
      return provider ? `${id} (${provider.provider_name})` : id
    })

    const companyNames = preferences.companies.map((id) => {
      const company = companies.find((c) => c.id === id)
      return company ? `${id} (${company.name})` : id
    })

    return {
      statusNames,
      typeNames,
      languageNames,
      countryNames,
      watchRegionNames,
      providerNames,
      companyNames,
    }
  }

  useEffect(() => {
    const savedPreferences = localStorage.getItem('tv-preferences')
    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences) as Partial<TvPreferences>
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...parsed,
          originCountries: Array.isArray(parsed.originCountries) ? parsed.originCountries : [],
          watchRegions: Array.isArray(parsed.watchRegions) ? parsed.watchRegions : [],
          originalLanguages: Array.isArray(parsed.originalLanguages) ? parsed.originalLanguages : [],
          companies: Array.isArray(parsed.companies) ? parsed.companies : [],
          status: Array.isArray(parsed.status) ? parsed.status : [],
          type: Array.isArray(parsed.type) ? parsed.type : [],
          watchProviders: Array.isArray(parsed.watchProviders) ? parsed.watchProviders : [],
        })
      } catch (e) {
        console.error('Failed to parse saved preferences:', e)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('tv-preferences', JSON.stringify(preferences))
  }, [preferences])

  useEffect(() => {
    const fetchWatchProviders = async () => {
      try {
        setLoadingProviders(true)
        const response = await fetch(`${API_BASE_URL}/tv/providers/watch`, {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data)) {
            setWatchProviders(
              data.slice(0, 20).map((provider: any) => ({
                provider_id: provider.provider_id,
                provider_name: provider.provider_name,
                logo_path: provider.logo_path,
              })),
            )
          }
        }
      } catch (err) {
        console.error('Failed to fetch watch providers:', err)
        setError('Failed to load watch providers')
      } finally {
        setLoadingProviders(false)
      }
    }

    if (token) {
      fetchWatchProviders()
    }
  }, [token])

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoadingCompanies(true)
        const response = await fetch(`${API_BASE_URL}/tv/companies/production`, {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data)) {
            setCompanies(data)
          }
        }
      } catch (err) {
        console.error('Failed to fetch companies:', err)
        setError('Failed to load companies')
      } finally {
        setLoadingCompanies(false)
      }
    }

    if (token) {
      fetchCompanies()
    }
  }, [token])

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
            setWatchlistIds(data.map((item: any) => item.tmdb_id))
            setWatchedShowIds(data.filter((item: any) => item.watched).map((item: any) => item.tmdb_id))
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

  useEffect(() => {
    const displayNames = getDisplayNames()

    console.log('TV Preferences - API Ready Data:', {
      airDateGte: formatDateToDDMMYYYY(preferences.airDateGte) || 'Not set',
      airDateLte: formatDateToDDMMYYYY(preferences.airDateLte) || 'Not set',
      episodeRuntimeGte: preferences.episodeRuntimeGte || 'Not set',
      episodeRuntimeLte: preferences.episodeRuntimeLte || 'Not set',
      status: {
        codes: preferences.status,
        display: displayNames.statusNames,
      },
      type: {
        codes: preferences.type,
        display: displayNames.typeNames,
      },
      originalLanguages: {
        codes: preferences.originalLanguages,
        display: displayNames.languageNames,
      },
      originCountries: {
        codes: preferences.originCountries,
        display: displayNames.countryNames,
      },
      watchRegions: {
        codes: preferences.watchRegions,
        display: displayNames.watchRegionNames,
      },
      watchProviders: {
        codes: preferences.watchProviders,
        display: displayNames.providerNames,
      },
      companies: {
        codes: preferences.companies,
        display: displayNames.companyNames,
      },
    })
  }, [preferences, watchProviders, companies])

  const handleDateChange = (field: 'airDateGte' | 'airDateLte', value: string) => {
    setPreferences((prev) => ({
      ...prev,
      [field]: value || undefined,
    }))
  }

  const getDatePickerValue = (value?: string): Dayjs | null => {
    if (!value) {
      return null
    }

    const parsed = dayjs(value)
    return parsed.isValid() ? parsed : null
  }

  const handleDatePickerChange = (field: 'airDateGte' | 'airDateLte', value: Dayjs | null) => {
    handleDateChange(field, value ? value.format('YYYY-MM-DD') : '')
  }

  const handleRuntimeChange = (field: 'episodeRuntimeGte' | 'episodeRuntimeLte', value: string) => {
    setPreferences((prev) => ({
      ...prev,
      [field]: value ? parseInt(value) : undefined,
    }))
  }

  const handleMultiSelect = (field: keyof TvPreferences, value: string | number, checked: boolean) => {
    setPreferences((prev) => {
      const current = prev[field] as unknown[]
      if (checked) {
        return {
          ...prev,
          [field]: [...current, value],
        }
      }

      return {
        ...prev,
        [field]: current.filter((item) => item !== value),
      }
    })
  }

  const handleReset = () => {
    setPreferences(DEFAULT_PREFERENCES)
  }

  const formatSelectedValues = (values: Array<string | number>) => {
    if (values.length === 0) {
      return 'Any'
    }

    return values.join(', ')
  }

  const formatOptionalValue = (value?: string | number) => {
    if (value === undefined || value === null || value === '') {
      return 'Any'
    }

    return String(value)
  }

  const formatOptionalDate = (value?: string) => {
    if (!value) {
      return 'Any'
    }

    return formatDateToDDMMYYYY(value) || 'Any'
  }

  const getSummaryLabels = () => {
    const status = preferences.status
      .map((id) => STATUS_OPTIONS.find((item) => item.id === id)?.name)
      .filter((value): value is string => Boolean(value))

    const type = preferences.type
      .map((id) => TYPE_OPTIONS.find((item) => item.id === id)?.name)
      .filter((value): value is string => Boolean(value))

    const languages = preferences.originalLanguages
      .map((code) => LANGUAGE_OPTIONS.find((item) => item.code === code)?.name)
      .filter((value): value is string => Boolean(value))

    const countries = preferences.originCountries
      .map((code) => COUNTRY_OPTIONS.find((item) => item.code === code)?.name)
      .filter((value): value is string => Boolean(value))

    const watchRegions = preferences.watchRegions
      .map((code) => COUNTRY_OPTIONS.find((item) => item.code === code)?.name)
      .filter((value): value is string => Boolean(value))

    const watchProviderNames = preferences.watchProviders
      .map((id) => watchProviders.find((item) => item.provider_id === id)?.provider_name)
      .filter((value): value is string => Boolean(value))

    const companyNames = preferences.companies
      .map((id) => companies.find((item) => item.id === id)?.name)
      .filter((value): value is string => Boolean(value))

    return {
      status,
      type,
      languages,
      countries,
      watchRegions,
      watchProviderNames,
      companyNames,
    }
  }

  const handleAddToWatchlist = async (event: React.MouseEvent, show: TmdbTvResult) => {
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
          tmdb_id: show.id,
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

  const handleRemoveFromWatchlist = async (event: React.MouseEvent, showId: number) => {
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

  const handleMarkAsWatched = async (event: React.MouseEvent, show: TmdbTvResult) => {
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

  const handleRecommend = async () => {
    setIsLoadingRecommendations(true)
    setRecommendationError(null)

    try {
      // Build query parameters from preferences
      const params = new URLSearchParams()

      if (preferences.airDateGte) {
        params.append('air_date_gte', preferences.airDateGte)
      }
      if (preferences.airDateLte) {
        params.append('air_date_lte', preferences.airDateLte)
      }
      if (preferences.episodeRuntimeGte) {
        params.append('with_runtime_gte', String(preferences.episodeRuntimeGte))
      }
      if (preferences.episodeRuntimeLte) {
        params.append('with_runtime_lte', String(preferences.episodeRuntimeLte))
      }
      if (preferences.status.length > 0) {
        params.append('with_status', preferences.status.join(','))
      }
      if (preferences.type.length > 0) {
        params.append('with_type', preferences.type.join(','))
      }
      if (preferences.originalLanguages.length > 0) {
        params.append('with_original_language', preferences.originalLanguages.join('|'))
      }
      if (preferences.originCountries.length > 0) {
        params.append('with_origin_country', preferences.originCountries.join('|'))
      }
      if (preferences.watchProviders.length > 0) {
        params.append('with_watch_providers', preferences.watchProviders.join('|'))
        const selectedRegions = preferences.watchRegions
          .map((region) => region.trim().toUpperCase())
          .filter((region) => region.length === 2)
        params.append('watch_region', selectedRegions.length > 0 ? selectedRegions.join('|') : 'US')
      }
      if (preferences.companies.length > 0) {
        params.append('with_companies', preferences.companies.join('|'))
      }

      const response = await fetch(`${API_BASE_URL}/tv/discover?${params.toString()}`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.results || [])
      } else {
        setRecommendationError('Failed to fetch recommendations')
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err)
      setRecommendationError('Failed to fetch recommendations')
    } finally {
      setIsLoadingRecommendations(false)
    }
  }

  const handleCardClick = (show: TmdbTvResult) => {
    navigate(`/show/${show.id}`)
  }

  const slides: { key: string; title: string; content: ReactNode }[] = [
    {
      key: 'air-date-runtime',
      title: 'Air Date Range and Episode Runtime',
      content: (
        <div className="combined-grid">
          <div className="category-subsection">
            <h3>Air Date Range</h3>
            <div className="form-row">
              <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
                <div className="form-group">
                  <label htmlFor="airDateGte">From Date</label>
                  <DatePicker
                    value={getDatePickerValue(preferences.airDateGte)}
                    format="DD/MM/YYYY"
                    onChange={(value) => handleDatePickerChange('airDateGte', value)}
                    slotProps={{
                      textField: {
                        id: 'airDateGte',
                        placeholder: 'DD/MM/YYYY',
                        fullWidth: true,
                      },
                    }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="airDateLte">To Date</label>
                  <DatePicker
                    value={getDatePickerValue(preferences.airDateLte)}
                    format="DD/MM/YYYY"
                    onChange={(value) => handleDatePickerChange('airDateLte', value)}
                    slotProps={{
                      textField: {
                        id: 'airDateLte',
                        placeholder: 'DD/MM/YYYY',
                        fullWidth: true,
                      },
                    }}
                  />
                </div>
              </LocalizationProvider>
            </div>
          </div>

          <div className="category-subsection">
            <h3>Episode Runtime (minutes)</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="episodeRuntimeGte">Minimum</label>
                <input
                  id="episodeRuntimeGte"
                  type="number"
                  min="0"
                  max="200"
                  value={preferences.episodeRuntimeGte || ''}
                  onChange={(e) => handleRuntimeChange('episodeRuntimeGte', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label htmlFor="episodeRuntimeLte">Maximum</label>
                <input
                  id="episodeRuntimeLte"
                  type="number"
                  min="0"
                  max="200"
                  value={preferences.episodeRuntimeLte || ''}
                  onChange={(e) => handleRuntimeChange('episodeRuntimeLte', e.target.value)}
                  placeholder="200"
                />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'status-type',
      title: 'Status and Type',
      content: (
        <div className="combined-grid">
          <div className="category-subsection">
            <h3>Status</h3>
            <div className="checkbox-group">
              {STATUS_OPTIONS.map((status) => (
                <label key={status.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(preferences.status as number[]).includes(status.id)}
                    onChange={(e) => handleMultiSelect('status', status.id, e.target.checked)}
                  />
                  <span>{status.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="category-subsection">
            <h3>Type</h3>
            <div className="checkbox-group">
              {TYPE_OPTIONS.map((type) => (
                <label key={type.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(preferences.type as number[]).includes(type.id)}
                    onChange={(e) => handleMultiSelect('type', type.id, e.target.checked)}
                  />
                  <span>{type.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'language-country',
      title: 'Original Language and Origin Country',
      content: (
        <div className="combined-grid">
          <div className="category-subsection">
            <h3>Original Language</h3>
            <div className="checkbox-group">
              {LANGUAGE_OPTIONS.map((lang) => (
                <label key={lang.code} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(preferences.originalLanguages as string[]).includes(lang.code)}
                    onChange={(e) => handleMultiSelect('originalLanguages', lang.code, e.target.checked)}
                  />
                  <span>{lang.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="category-subsection">
            <h3>Origin Country</h3>
            <div className="checkbox-group">
              {COUNTRY_OPTIONS.map((country) => (
                <label key={country.code} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(preferences.originCountries as string[]).includes(country.code)}
                    onChange={(e) => handleMultiSelect('originCountries', country.code, e.target.checked)}
                  />
                  <span>{country.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'providers',
      title: 'Watch Providers',
      content: loadingProviders ? (
        <p className="loading-text">Loading providers...</p>
      ) : (
        <div className="combined-grid">
          <div className="category-subsection">
            <h3>Providers</h3>
            <div className="checkbox-group">
              {watchProviders.map((provider) => (
                <label key={provider.provider_id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(preferences.watchProviders as number[]).includes(provider.provider_id)}
                    onChange={(e) => handleMultiSelect('watchProviders', provider.provider_id, e.target.checked)}
                  />
                  <span>{provider.provider_name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="category-subsection">
            <h3>Watch Region (for providers)</h3>
            <div className="checkbox-group">
              {WATCH_REGION_OPTIONS.map((country) => (
                <label key={`watch-region-${country.code}`} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={(preferences.watchRegions as string[]).includes(country.code)}
                    onChange={(e) => handleMultiSelect('watchRegions', country.code, e.target.checked)}
                  />
                  <span>{country.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'companies',
      title: 'Production Companies',
      content: loadingCompanies ? (
        <p className="loading-text">Loading companies...</p>
      ) : (
        <div className="checkbox-group">
          {companies.map((company) => (
            <label key={company.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={(preferences.companies as number[]).includes(company.id)}
                onChange={(e) => handleMultiSelect('companies', company.id, e.target.checked)}
              />
              <span>{company.name}</span>
            </label>
          ))}
        </div>
      ),
    },
  ]

  const summaryLabels = getSummaryLabels()
  const watchProvidersText = formatSelectedValues(summaryLabels.watchProviderNames)
  const productionCompaniesText = formatSelectedValues(summaryLabels.companyNames)
  const shouldStackProvidersAndCompanies =
    watchProvidersText.length > 90 || productionCompaniesText.length > 90
  const isFirstSlide = currentSlide === 0
  const isLastSlide = currentSlide === slides.length - 1

  const goToPreviousSlide = () => {
    if (!isFirstSlide) {
      setCurrentSlide((prev) => prev - 1)
    }
  }

  const goToNextSlide = () => {
    if (!isLastSlide) {
      setCurrentSlide((prev) => prev + 1)
    }
  }

  if (!token) {
    navigate('/login')
    return null
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

      <main className="app preferences-page">
        <header className="hero">
          <h2>TV Show Preferences</h2>
          <p>Customize your TV show recommendation preferences</p>
        </header>

        {error && <div className="error-message">{error}</div>}

        <form className="preferences-form">
          <div className="category-slider">
            <div className="slider-track" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
              {slides.map((slide) => (
                <div key={slide.key} className="form-section slider-slide">
                  <h2>{slide.title}</h2>
                  {slide.content}
                </div>
              ))}
            </div>
          </div>

          <div className="slider-controls">
            <button type="button" className="slider-button" onClick={goToPreviousSlide} disabled={isFirstSlide}>
              Previous
            </button>

            <div className="slider-dots" aria-label="Preference categories">
              {slides.map((slide, index) => (
                <button
                  key={slide.key}
                  type="button"
                  className={`slider-dot ${index === currentSlide ? 'active' : ''}`}
                  onClick={() => setCurrentSlide(index)}
                  aria-label={`Go to ${slide.title}`}
                />
              ))}
            </div>

            <button type="button" className="slider-button" onClick={goToNextSlide} disabled={isLastSlide}>
              Next
            </button>
          </div>

          <div className="form-actions">
            <button type="button" className="reset-button" onClick={handleReset}>
              Reset Preferences
            </button>
            <button 
              type="button" 
              className="back-button" 
              onClick={handleRecommend}
              disabled={isLoadingRecommendations}
            >
              {isLoadingRecommendations ? 'Loading recommendations...' : 'Get Recommendations'}
            </button>
          </div>

          <div className="preferences-info">
            <h3>Your Selected Preferences</h3>
            <ul>
              <li className="summary-pair-row">
                <div className="summary-pair">
                  <span>
                    <strong>Air Date (From):</strong> {formatOptionalDate(preferences.airDateGte)}
                  </span>
                  <span>
                    <strong>Air Date (To):</strong> {formatOptionalDate(preferences.airDateLte)}
                  </span>
                </div>
              </li>
              <li className="summary-pair-row">
                <div className="summary-pair">
                  <span>
                    <strong>Runtime (Min):</strong> {formatOptionalValue(preferences.episodeRuntimeGte)}
                  </span>
                  <span>
                    <strong>Runtime (Max):</strong> {formatOptionalValue(preferences.episodeRuntimeLte)}
                  </span>
                </div>
              </li>
              <li className="summary-pair-row">
                <div className="summary-pair">
                  <span>
                    <strong>Status:</strong> {formatSelectedValues(summaryLabels.status)}
                  </span>
                  <span>
                    <strong>Type:</strong> {formatSelectedValues(summaryLabels.type)}
                  </span>
                </div>
              </li>
              <li className="summary-pair-row">
                <div className="summary-pair">
                  <span>
                    <strong>Languages:</strong> {formatSelectedValues(summaryLabels.languages)}
                  </span>
                  <span>
                    <strong>Countries:</strong> {formatSelectedValues(summaryLabels.countries)}
                  </span>
                </div>
              </li>
              <li className="summary-pair-row">
                <div className="summary-pair">
                  <span>
                    <strong>Watch Regions:</strong> {formatSelectedValues(summaryLabels.watchRegions)}
                  </span>
                </div>
              </li>
              <li className="summary-pair-row">
                <div className={`summary-pair ${shouldStackProvidersAndCompanies ? 'summary-pair--stacked' : ''}`}>
                  <span>
                    <strong>Watch Providers:</strong> {watchProvidersText}
                  </span>
                  <span>
                    <strong>Production Companies:</strong> {productionCompaniesText}
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </form>

        {recommendationError && <div className="error-message">{recommendationError}</div>}

        {recommendations.length > 0 && (
          <section className="recommendations-section">
            <h2>Recommended Shows</h2>
            <div className="results-grid" aria-live="polite">
              {recommendations.map((show) => (
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
                    <h3>{show.name}</h3>
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
                          isAddingShowId === show.id ||
                          isRemovingShowId === show.id ||
                          isMarkingWatchedShowId === show.id
                        }
                      >
                        {watchedShowIds.includes(show.id) ? <VisibilityIcon /> : <VisibilityOutlinedIcon />}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  )
}

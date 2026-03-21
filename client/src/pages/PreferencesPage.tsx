import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { TvPreferences, WatchProvider, Company } from '../types/tv'
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

export function PreferencesPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState<TvPreferences>({
    originCountries: [],
    originalLanguages: [],
    companies: [],
    status: [],
    type: [],
    watchProviders: [],
  })

  const [watchProviders, setWatchProviders] = useState<WatchProvider[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load watch providers from local storage or initialize
  useEffect(() => {
    const savedPreferences = localStorage.getItem('tv-preferences')
    if (savedPreferences) {
      try {
        setPreferences(JSON.parse(savedPreferences))
      } catch (e) {
        console.error('Failed to parse saved preferences:', e)
      }
    }
  }, [])

  // Save preferences to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('tv-preferences', JSON.stringify(preferences))
  }, [preferences])

  // Fetch watch providers from backend
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

  // Fetch popular companies from backend
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

  // Log preferences whenever they change - showing data that will be sent to API
  useEffect(() => {
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
        providerNames,
        companyNames,
      }
    }

    const displayNames = getDisplayNames()

    console.log('📺 TV Preferences - API Ready Data:', {
      airDateGte: preferences.airDateGte || 'Not set',
      airDateLte: preferences.airDateLte || 'Not set',
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
      } else {
        return {
          ...prev,
          [field]: current.filter((item) => item !== value),
        }
      }
    })
  }

  const handleReset = () => {
    setPreferences({
      originCountries: [],
      originalLanguages: [],
      companies: [],
      status: [],
      type: [],
      watchProviders: [],
    })
  }

  if (!token) {
    navigate('/login')
    return null
  }

  return (
    <div className="preferences-container">
      <div className="preferences-header">
        <h1>TV Show Preferences</h1>
        <p>Customize your TV show recommendation preferences</p>
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Search
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form className="preferences-form">
        {/* Air Date Section */}
        <div className="form-section">
          <h2>Air Date Range</h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="airDateGte">From Date</label>
              <input
                id="airDateGte"
                type="date"
                value={preferences.airDateGte || ''}
                onChange={(e) => handleDateChange('airDateGte', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="airDateLte">To Date</label>
              <input
                id="airDateLte"
                type="date"
                value={preferences.airDateLte || ''}
                onChange={(e) => handleDateChange('airDateLte', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Episode Runtime Section */}
        <div className="form-section">
          <h2>Episode Runtime (minutes)</h2>
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

        {/* Status Section */}
        <div className="form-section">
          <h2>Status</h2>
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

        {/* Type Section */}
        <div className="form-section">
          <h2>Type</h2>
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

        {/* Original Language Section */}
        <div className="form-section">
          <h2>Original Language</h2>
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

        {/* Origin Country Section */}
        <div className="form-section">
          <h2>Origin Country</h2>
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

        {/* Watch Providers Section */}
        <div className="form-section">
          <h2>Watch Providers</h2>
          {loadingProviders ? (
            <p className="loading-text">Loading providers...</p>
          ) : (
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
          )}
        </div>

        {/* Companies Section */}
        <div className="form-section">
          <h2>Production Companies</h2>
          {loadingCompanies ? (
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
          )}
        </div>

        {/* Action Buttons */}
        <div className="form-actions">
          <button type="button" className="reset-button" onClick={handleReset}>
            Reset Preferences
          </button>
          <button type="button" className="back-button" onClick={() => navigate('/')}>
            Back to Search
          </button>
        </div>

        {/* Display saved preferences info */}
        <div className="preferences-info">
          <h3>Preferences Summary</h3>
          <ul>
            <li>
              <strong>Status:</strong> {preferences.status.length > 0 ? preferences.status.length : 'None'} selected
            </li>
            <li>
              <strong>Type:</strong> {preferences.type.length > 0 ? preferences.type.length : 'None'} selected
            </li>
            <li>
              <strong>Languages:</strong> {preferences.originalLanguages.length > 0 ? preferences.originalLanguages.length : 'None'} selected
            </li>
            <li>
              <strong>Countries:</strong> {preferences.originCountries.length > 0 ? preferences.originCountries.length : 'None'} selected
            </li>
            <li>
              <strong>Watch Providers:</strong> {preferences.watchProviders.length > 0 ? preferences.watchProviders.length : 'None'} selected
            </li>
            <li>
              <strong>Production Companies:</strong> {preferences.companies.length > 0 ? preferences.companies.length : 'None'} selected
            </li>
          </ul>
        </div>
      </form>
    </div>
  )
}

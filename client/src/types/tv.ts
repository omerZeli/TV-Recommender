export type TmdbTvResult = {
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
  watched?: boolean
}

export type TmdbTvDetails = {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  last_air_date: string
  vote_average: number
  vote_count: number
  original_language: string
  origin_country: string[]
  status: string
  tagline: string
  type: string
  in_production: boolean
  number_of_episodes: number
  number_of_seasons: number
  genres: { id: number; name: string }[]
  networks: { id: number; name: string; logo_path: string | null; origin_country: string }[]
  seasons: {
    id: number
    name: string
    overview: string
    air_date: string | null
    episode_count: number
    season_number: number
    poster_path: string | null
    vote_average: number
  }[]
  created_by: { id: number; name: string; profile_path: string | null }[]
  popularity: number
  aggregate_credits?: {
    cast: {
      id: number
      name: string
      profile_path: string | null
      order: number
      roles: { character: string; episode_count: number }[]
      total_episode_count: number
    }[]
  }
  keywords?: {
    results: { id: number; name: string }[]
  }
  videos?: {
    results: {
      id: string
      key: string
      name: string
      site: string
      type: string
      official: boolean
      published_at: string
    }[]
  }
}

export type TvPreferences = {
  airDateGte?: string
  airDateLte?: string
  episodeRuntimeGte?: number
  episodeRuntimeLte?: number
  originCountries: string[]
  watchRegions: string[]
  originalLanguages: string[]
  companies: number[]
  status: number[]
  type: number[]
  watchProviders: number[]
}

export type WatchProvider = {
  provider_id: number
  provider_name: string
  logo_path: string
}

export type Company = {
  id: number
  name: string
  logo_path: string | null
}

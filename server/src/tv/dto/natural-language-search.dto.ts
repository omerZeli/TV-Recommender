import { IsString, MinLength, MaxLength } from 'class-validator';

export class NaturalLanguageSearchDto {
  @IsString()
  @MinLength(10, { message: 'Search query must be at least 10 characters' })
  @MaxLength(1000, { message: 'Search query cannot exceed 1000 characters' })
  query: string;
}

/**
 * Structured output from the LLM after parsing natural language input
 * This is what the AI will return as JSON for discover parameters
 */
export interface ParsedDiscoverParams {
  with_genres?: string;
  with_networks?: string;
  with_watch_providers?: string;
  with_keywords?: string;
  with_original_language?: string;
  with_origin_country?: string;
  with_status?: string;
  with_runtime_gte?: number;
  with_runtime_lte?: number;
  vote_average_gte?: number;
  vote_average_lte?: number;
  first_air_date_gte?: string;
  first_air_date_lte?: string;
  watch_region?: string;
  include_adult?: boolean;
  sort_by?: string;
}

/**
 * Configuration for ID resolution endpoints
 * Maps entity types to their TMDB API endpoints
 */
export interface IdResolutionConfig {
  genres?: {
    query: string;
    endpoint: string;
  };
  networks?: {
    query: string;
    endpoint: string;
  };
  providers?: {
    query: string;
    endpoint: string;
  };
  keywords?: {
    query: string;
    endpoint: string;
  };
}

import { IsString, IsNumber, MinLength, MaxLength, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ReferenceShowDto {
  @IsNumber()
  tmdb_id: number;

  @IsString()
  name: string;
}

export class NaturalLanguageSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Search query cannot exceed 1000 characters' })
  query?: string;

  @IsOptional()
  @IsString()
  watchRegion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceShowDto)
  referenceShows?: ReferenceShowDto[];
}

/**
 * Structured output from the LLM after parsing natural language input.
 * Fields use underscore naming; tv.service.ts discoverKeyMap converts
 * underscore names to TMDB dot-notation (e.g. vote_average_gte → vote_average.gte).
 */
export interface ParsedDiscoverParams {
  // --- Date filtering ---
  air_date_gte?: string;              // air_date.gte
  air_date_lte?: string;              // air_date.lte
  first_air_date_year?: number;
  first_air_date_gte?: string;        // first_air_date.gte
  first_air_date_lte?: string;        // first_air_date.lte

  // --- Genre filters (comma/pipe-separated names → resolved to IDs) ---
  with_genres?: string;
  without_genres?: string;

  // --- Network / company filters (resolved to IDs) ---
  with_networks?: string;
  with_companies?: string;
  without_companies?: string;

  // --- Watch provider filters (resolved to IDs) ---
  with_watch_providers?: string;
  without_watch_providers?: string;
  with_watch_monetization_types?: string; // flatrate|free|ads|rent|buy

  // --- Keyword filters (resolved to IDs) ---
  with_keywords?: string;
  without_keywords?: string;

  // --- Thematic keyword groups (LLM output, ordered by universality) ---
  // Each entry is a pipe-separated theme string, e.g. ["friends|sitcom", "geek|scientist"]
  // Theme 1 = core intersection, last theme = most niche.
  thematic_keyword_groups?: string[];

  // --- Show type / status ---
  with_type?: string;    // 0-6 (comma/pipe separated)
  with_status?: string;  // 0=Returning,1=Planned,2=InProduction,3=Ended,4=Cancelled,5=Pilot

  // --- Language / region ---
  with_original_language?: string;
  with_origin_country?: string;
  language?: string;
  watch_region?: string;
  timezone?: string;

  // --- Runtime (minutes) ---
  with_runtime_gte?: number;  // with_runtime.gte
  with_runtime_lte?: number;  // with_runtime.lte

  // --- Ratings ---
  vote_average_gte?: number;  // vote_average.gte
  vote_average_lte?: number;  // vote_average.lte
  vote_count_gte?: number;    // vote_count.gte
  vote_count_lte?: number;    // vote_count.lte

  // --- Boolean flags ---
  include_adult?: boolean;
  include_null_first_air_dates?: boolean;
  screened_theatrically?: boolean;

  // --- Sorting / pagination ---
  sort_by?: string;
  page?: number;
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

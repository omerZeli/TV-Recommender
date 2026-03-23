import {
  Injectable,
  InternalServerErrorException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParsedDiscoverParams } from './dto/natural-language-search.dto';

/**
 * Maps user-friendly entity names to TMDB IDs
 * This cache helps reduce API calls for common searches
 */
interface IdCache {
  genres: Map<string, number>;
  networks: Map<string, number>;
  providers: Map<string, number>;
  keywords: Map<string, number>;
}

@Injectable()
export class NaturalLanguageOrchestrationService {
  private idCache: IdCache = {
    genres: new Map(),
    networks: new Map(),
    providers: new Map(),
    keywords: new Map(),
  };

  constructor(private readonly configService: ConfigService) {}

  private getTmdbBearerToken(): string {
    const tmdbBearerToken = this.configService.get<string>('TMDB_BEARER_TOKEN');
    if (!tmdbBearerToken) {
      throw new InternalServerErrorException('TMDB credentials are not configured');
    }
    return tmdbBearerToken;
  }

  private getGroqApiKey(): string {
    const groqApiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!groqApiKey) {
      throw new InternalServerErrorException('Groq API key is not configured');
    }
    return groqApiKey;
  }

  private getGroqModel(): string {
    return this.configService.get<string>('GROQ_MODEL', 'llama-3.3-70b-versatile');
  }

  /**
   * Calls Groq API to parse natural language and extract TV show parameters
   * Returns a JSON-parseable string with discovered parameters
   */
  async parseWithLlm(query: string): Promise<ParsedDiscoverParams> {
    const groqApiKey = this.getGroqApiKey();
    const groqModel = this.getGroqModel();

    const systemPrompt = `You are a TV show search parameter extractor.
Your job is to parse natural language TV show preferences and extract TMDB /discover/tv parameters.
Return ONLY valid JSON (no markdown, no code blocks). All fields are optional — only include what the user actually mentioned.

Available fields:
{
  "with_genres":                  "comma-separated genre names, e.g. 'Drama,Thriller'",
  "without_genres":               "comma-separated genre names to exclude",
  "with_networks":                "comma-separated broadcast network names, e.g. 'HBO,AMC' (not streaming services)",
  "with_companies":               "comma-separated production company names, e.g. 'BBC,A24'",
  "without_companies":            "comma-separated production company names to exclude",
  "with_watch_providers":         "comma-separated streaming service names, e.g. 'Netflix,Prime Video,Disney Plus'",
  "without_watch_providers":      "comma-separated streaming services to exclude",
  "with_watch_monetization_types":"pipe-separated monetization types: flatrate|free|ads|rent|buy",
  "with_keywords":                "comma-separated theme/keyword descriptors, e.g. 'heist,time travel'",
  "without_keywords":             "comma-separated keywords to exclude",
  "with_type":                    "show type 0=Documentary,1=News,2=Miniseries,3=Reality,4=Scripted,5=TalkShow,6=Video (pipe for OR)",
  "with_status":                  "status 0=Returning,1=Planned,2=InProduction,3=Ended,4=Cancelled,5=Pilot (pipe for OR)",
  "with_original_language":       "ISO 639-1 code, e.g. 'en','es','ko','ja'",
  "with_origin_country":          "ISO 3166-1 code, e.g. 'US','GB','KR'",
  "language":                     "response language, default 'en-US'",
  "watch_region":                 "ISO 3166-1 code for watch provider filtering, e.g. 'US','GB'",
  "timezone":                     "timezone string, e.g. 'America/New_York'",
  "with_runtime_gte":             30,
  "with_runtime_lte":             90,
  "vote_average_gte":             6.5,
  "vote_average_lte":             10,
  "vote_count_gte":               100,
  "vote_count_lte":               50000,
  "first_air_date_year":          2020,
  "first_air_date_gte":           "YYYY-MM-DD",
  "first_air_date_lte":           "YYYY-MM-DD",
  "air_date_gte":                 "YYYY-MM-DD",
  "air_date_lte":                 "YYYY-MM-DD",
  "include_adult":                false,
  "include_null_first_air_dates": false,
  "screened_theatrically":        false,
  "sort_by":                      "popularity.desc (options: popularity.asc/desc, vote_average.asc/desc, vote_count.asc/desc, first_air_date.asc/desc, name.asc/desc)",
  "page":                         1
}

Rules:
- Distinguish with_networks (broadcast: HBO, BBC, AMC) from with_watch_providers (streaming: Netflix, Prime Video, Disney Plus, Apple TV+, Hulu).
- Never include comments or extra text — pure JSON only.`;

    const userMessage = `Extract TV show search parameters from this request: "${query}"`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userMessage,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Groq API error:', error);
        console.error('Groq model used:', groqModel);
        throw new BadGatewayException('Failed to process natural language query with LLM');
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new BadGatewayException('Empty response from LLM');
      }

      // Parse the JSON response
      const parsedParams = JSON.parse(content.trim()) as ParsedDiscoverParams;
      return parsedParams;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('Failed to parse LLM response as JSON:', error);
        throw new BadGatewayException('Invalid response format from LLM');
      }
      throw error;
    }
  }

  /**
   * Search TMDB for genre ID by name
   */
  private async resolveGenreIds(genreNames: string[]): Promise<number[]> {
    const tmdbToken = this.getTmdbBearerToken();
    const ids: number[] = [];

    try {
      // Get all genres from TMDB
      const response = await fetch(
        'https://api.themoviedb.org/3/genre/tv/list?language=en-US',
        {
          headers: {
            Authorization: `Bearer ${tmdbToken}`,
            accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new BadGatewayException('Failed to fetch genres from TMDB');
      }

      const data = await response.json();
      const genreMap = new Map<string, number>(
        (data.genres ?? []).map((g: { name: string; id: number }) => [g.name.toLowerCase(), g.id]),
      );

      for (const genreName of genreNames) {
        const lowerName = genreName.toLowerCase().trim();
        if (genreMap.has(lowerName)) {
          ids.push(genreMap.get(lowerName)!);
        }
      }
    } catch (error) {
      console.error('Error resolving genre IDs:', error);
    }

    return ids;
  }

  /**
   * Search TMDB for network/company ID by name
   */
  private async resolveNetworkIds(networkNames: string[]): Promise<number[]> {
    const tmdbToken = this.getTmdbBearerToken();
    const ids: number[] = [];

    for (const networkName of networkNames) {
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/search/company?query=${encodeURIComponent(networkName)}`,
          {
            headers: {
              Authorization: `Bearer ${tmdbToken}`,
              accept: 'application/json',
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            // Use the first result (most relevant)
            ids.push(data.results[0].id);
            this.idCache.networks.set(networkName.toLowerCase(), data.results[0].id);
          }
        }
      } catch (error) {
        console.error(`Error resolving network ID for ${networkName}:`, error);
      }
    }

    return ids;
  }

  /**
   * Search TMDB for watch provider ID by name
   */
  private async resolveProviderIds(
    providerNames: string[],
    watchRegion: string = 'US',
  ): Promise<number[]> {
    const tmdbToken = this.getTmdbBearerToken();
    const ids: number[] = [];

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/watch/providers/tv?language=en-US&watch_region=${watchRegion}`,
        {
          headers: {
            Authorization: `Bearer ${tmdbToken}`,
            accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new BadGatewayException('Failed to fetch watch providers from TMDB');
      }

      const data = await response.json();
      const providerMap = new Map<string, number>(
        (data.results ?? []).map((p: { provider_name: string; provider_id: number }) => [
          p.provider_name.toLowerCase(),
          p.provider_id,
        ]),
      );

      for (const providerName of providerNames) {
        const lowerName = providerName.toLowerCase().trim();
        if (providerMap.has(lowerName)) {
          ids.push(providerMap.get(lowerName)!);
        }
      }
    } catch (error) {
      console.error('Error resolving provider IDs:', error);
    }

    return ids;
  }

  /**
   * Search TMDB for keyword ID by name
   */
  private async resolveKeywordIds(keywords: string[]): Promise<number[]> {
    const tmdbToken = this.getTmdbBearerToken();
    const ids: number[] = [];

    for (const keyword of keywords) {
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/search/keyword?query=${encodeURIComponent(keyword)}`,
          {
            headers: {
              Authorization: `Bearer ${tmdbToken}`,
              accept: 'application/json',
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            // Use the first result (most relevant)
            ids.push(data.results[0].id);
            this.idCache.keywords.set(keyword.toLowerCase(), data.results[0].id);
          }
        }
      } catch (error) {
        console.error(`Error resolving keyword ID for ${keyword}:`, error);
      }
    }

    return ids;
  }

  async orchestrateDiscoverParameters(parsedParams: ParsedDiscoverParams): Promise<Record<string, any>> {
    const discoverParams: Record<string, any> = {};

    // --- Watch region (needed early for provider resolution) ---
    const watchRegion = parsedParams.watch_region || 'US';
    discoverParams.watch_region = watchRegion;

    // --- Genres ---
    if (parsedParams.with_genres) {
      const genreIds = await this.resolveGenreIds(parsedParams.with_genres.split(',').map((g) => g.trim()));
      if (genreIds.length > 0) discoverParams.with_genres = genreIds.join(',');
    }
    if (parsedParams.without_genres) {
      const genreIds = await this.resolveGenreIds(parsedParams.without_genres.split(',').map((g) => g.trim()));
      if (genreIds.length > 0) discoverParams.without_genres = genreIds.join(',');
    }

    // --- Networks ---
    if (parsedParams.with_networks) {
      const networkIds = await this.resolveNetworkIds(parsedParams.with_networks.split(',').map((n) => n.trim()));
      if (networkIds.length > 0) discoverParams.with_networks = networkIds.join(',');
    }

    // --- Companies ---
    if (parsedParams.with_companies) {
      const companyIds = await this.resolveNetworkIds(parsedParams.with_companies.split(',').map((c) => c.trim()));
      if (companyIds.length > 0) discoverParams.with_companies = companyIds.join(',');
    }
    if (parsedParams.without_companies) {
      const companyIds = await this.resolveNetworkIds(parsedParams.without_companies.split(',').map((c) => c.trim()));
      if (companyIds.length > 0) discoverParams.without_companies = companyIds.join(',');
    }

    // --- Watch providers ---
    if (parsedParams.with_watch_providers) {
      const providerIds = await this.resolveProviderIds(parsedParams.with_watch_providers.split(',').map((p) => p.trim()), watchRegion);
      if (providerIds.length > 0) discoverParams.with_watch_providers = providerIds.join('|');
    }
    if (parsedParams.without_watch_providers) {
      const providerIds = await this.resolveProviderIds(parsedParams.without_watch_providers.split(',').map((p) => p.trim()), watchRegion);
      if (providerIds.length > 0) discoverParams.without_watch_providers = providerIds.join('|');
    }
    if (parsedParams.with_watch_monetization_types) {
      discoverParams.with_watch_monetization_types = parsedParams.with_watch_monetization_types;
    }

    // --- Keywords ---
    if (parsedParams.with_keywords) {
      const keywordIds = await this.resolveKeywordIds(parsedParams.with_keywords.split(',').map((k) => k.trim()));
      if (keywordIds.length > 0) discoverParams.with_keywords = keywordIds.join(',');
    }
    if (parsedParams.without_keywords) {
      const keywordIds = await this.resolveKeywordIds(parsedParams.without_keywords.split(',').map((k) => k.trim()));
      if (keywordIds.length > 0) discoverParams.without_keywords = keywordIds.join(',');
    }

    // --- Pass-through string / enum fields ---
    const stringFields: Array<keyof ParsedDiscoverParams> = [
      'with_original_language', 'with_origin_country', 'language', 'timezone',
      'with_status', 'with_type', 'sort_by',
      'first_air_date_gte', 'first_air_date_lte', 'air_date_gte', 'air_date_lte',
    ];
    for (const field of stringFields) {
      if (parsedParams[field] !== undefined && parsedParams[field] !== null) {
        discoverParams[field] = parsedParams[field];
      }
    }

    // --- Pass-through numeric fields (stored as strings for URLSearchParams) ---
    const numericFields: Array<keyof ParsedDiscoverParams> = [
      'first_air_date_year', 'page',
      'with_runtime_gte', 'with_runtime_lte',
      'vote_average_gte', 'vote_average_lte',
      'vote_count_gte', 'vote_count_lte',
    ];
    for (const field of numericFields) {
      if (parsedParams[field] !== undefined) {
        discoverParams[field] = String(parsedParams[field]);
      }
    }

    // --- Pass-through boolean fields ---
    const booleanFields: Array<keyof ParsedDiscoverParams> = [
      'include_adult', 'include_null_first_air_dates', 'screened_theatrically',
    ];
    for (const field of booleanFields) {
      if (parsedParams[field] !== undefined) {
        discoverParams[field] = String(parsedParams[field]);
      }
    }

    return discoverParams;
  }

  /**
   * Full pipeline: parse natural language -> resolve IDs -> return discover params
   */
  async processNaturalLanguageQuery(query: string): Promise<Record<string, any>> {
    // Step 1: Parse with LLM
    const parsedParams = await this.parseWithLlm(query);
    console.log('Parsed parameters from LLM:', parsedParams);

    // Step 2: Orchestrate and resolve IDs
    const discoverParams = await this.orchestrateDiscoverParameters(parsedParams);
    console.log('Final discover parameters:', discoverParams);

    return discoverParams;
  }
}

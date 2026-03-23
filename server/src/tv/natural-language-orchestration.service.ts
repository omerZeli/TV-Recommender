import {
  Injectable,
  InternalServerErrorException,
  BadGatewayException,
  BadRequestException,
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
Your job is to parse natural language TV show preferences and extract TMDB discover parameters.
Return ONLY valid JSON (no markdown, no code blocks) with the following structure (all fields optional):
{
  "with_genres": "comma-separated genre names like 'Drama,Thriller'",
  "with_networks": "comma-separated network names like 'HBO,Netflix'",
  "with_watch_providers": "comma-separated provider names like 'Netflix,Prime Video'",
  "with_keywords": "comma-separated keywords like 'horror,supernatural'",
  "with_original_language": "language code like 'en' or 'es'",
  "with_origin_country": "country code like 'US' or 'GB'",
  "with_status": "0=Returning,1=Planned,2=In Production,3=Ended,4=Cancelled,5=Pilot",
  "with_runtime_gte": 30,
  "with_runtime_lte": 90,
  "vote_average_gte": 6.5,
  "watch_region": "US",
  "include_adult": false,
  "sort_by": "popularity.desc"
}
Leave out fields the user didn't mention. Never include field comments or non-JSON text.`;

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

  /**
   * Main orchestration method
   * Takes LLM-parsed parameters and resolves all names to TMDB IDs
   */
  async orchestrateDiscoverParameters(parsedParams: ParsedDiscoverParams): Promise<Record<string, any>> {
    const discoverParams: Record<string, any> = {};

    // Process genres
    if (parsedParams.with_genres) {
      const genreNames = parsedParams.with_genres.split(',').map((g) => g.trim());
      const genreIds = await this.resolveGenreIds(genreNames);
      if (genreIds.length > 0) {
        discoverParams.with_genres = genreIds.join(',');
      }
    }

    // Process networks
    if (parsedParams.with_networks) {
      const networkNames = parsedParams.with_networks.split(',').map((n) => n.trim());
      const networkIds = await this.resolveNetworkIds(networkNames);
      if (networkIds.length > 0) {
        discoverParams.with_networks = networkIds.join(',');
      }
    }

    // Set watch region if not already set
    const watchRegion = parsedParams.watch_region || 'US';
    discoverParams.watch_region = watchRegion;

    // Process watch providers
    if (parsedParams.with_watch_providers) {
      const providerNames = parsedParams.with_watch_providers.split(',').map((p) => p.trim());
      const providerIds = await this.resolveProviderIds(providerNames, watchRegion);
      if (providerIds.length > 0) {
        discoverParams.with_watch_providers = providerIds.join('|');
      }
    }

    // Process keywords
    if (parsedParams.with_keywords) {
      const keywordList = parsedParams.with_keywords.split(',').map((k) => k.trim());
      const keywordIds = await this.resolveKeywordIds(keywordList);
      if (keywordIds.length > 0) {
        discoverParams.with_keywords = keywordIds.join(',');
      }
    }

    // Pass through numeric and string parameters
    if (parsedParams.with_original_language) {
      discoverParams.with_original_language = parsedParams.with_original_language;
    }
    if (parsedParams.with_origin_country) {
      discoverParams.with_origin_country = parsedParams.with_origin_country;
    }
    if (parsedParams.with_status !== undefined) {
      discoverParams.with_status = String(parsedParams.with_status);
    }
    if (parsedParams.with_runtime_gte !== undefined) {
      discoverParams.with_runtime_gte = String(parsedParams.with_runtime_gte);
    }
    if (parsedParams.with_runtime_lte !== undefined) {
      discoverParams.with_runtime_lte = String(parsedParams.with_runtime_lte);
    }
    if (parsedParams.vote_average_gte !== undefined) {
      discoverParams.vote_average_gte = String(parsedParams.vote_average_gte);
    }
    if (parsedParams.first_air_date_gte) {
      discoverParams.first_air_date_gte = parsedParams.first_air_date_gte;
    }
    if (parsedParams.first_air_date_lte) {
      discoverParams.first_air_date_lte = parsedParams.first_air_date_lte;
    }
    if (parsedParams.include_adult !== undefined) {
      discoverParams.include_adult = String(parsedParams.include_adult);
    }
    if (parsedParams.sort_by) {
      discoverParams.sort_by = parsedParams.sort_by;
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

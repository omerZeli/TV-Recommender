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

  private tokenizeText(value: string): string[] {
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }

  private parseAndOrGroups(raw: string): string[][] {
    return raw
      .split(',')
      .map((andGroup) =>
        andGroup
          .split('|')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      )
      .filter((group) => group.length > 0);
  }

  private rankKeywordMatch(searchTerm: string, candidateName: string): number {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedCandidate = candidateName.trim().toLowerCase();

    if (normalizedSearch === normalizedCandidate) {
      return 1000;
    }

    let score = 0;

    if (
      normalizedCandidate.includes(normalizedSearch) ||
      normalizedSearch.includes(normalizedCandidate)
    ) {
      score += 120;
    }

    const searchTokens = this.tokenizeText(normalizedSearch);
    const candidateTokens = new Set(this.tokenizeText(normalizedCandidate));
    const overlap = searchTokens.filter((token) => candidateTokens.has(token)).length;

    score += overlap * 25;
    return score;
  }

  private normalizeKeywordExpression(raw: string): string | undefined {
    const cleaned = raw
      .replace(/\s*\|\s*/g, '|')
      .replace(/\s*,\s*/g, ',')
      .replace(/[|,]{2,}/g, '|')
      .replace(/^[|,]+|[|,]+$/g, '')
      .trim();

    return cleaned.length > 0 ? cleaned : undefined;
  }

  async expandKeywordsForRecall(
    query: string,
    originalWithKeywords: string,
    currentCount: number,
    targetCount: number,
  ): Promise<string | undefined> {
    const groqApiKey = this.getGroqApiKey();
    const groqModel = this.getGroqModel();

    const systemPrompt = `You expand TMDB TV discover keyword filters for higher recall.
Return ONLY valid JSON: {"with_keywords":"..."}

Rules:
- Keep the same intent as the original keywords.
- Add semantic alternatives/siblings the user did not explicitly write (e.g. money -> wealth|business|finance|investor).
- Use TMDB-style keyword expression syntax where comma means AND and pipe means OR.
- If current results are low (< target), prefer wider recall.
- If current results are 0, strongly prefer OR behavior across concepts to avoid over-constrained AND.
- Limit to 6 to 14 total keyword terms.
- Do not output explanations, markdown, or extra fields.`;

    const userMessage = `User query: "${query}"
Original with_keywords: "${originalWithKeywords}"
Current results count: ${currentCount}
Target results count: ${targetCount}

Generate a broader with_keywords expression.`;

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.2,
          max_tokens: 180,
        }),
      });

      if (!response.ok) {
        return undefined;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return undefined;
      }

      const parsed = JSON.parse(content.trim()) as { with_keywords?: string };
      if (!parsed.with_keywords) {
        return undefined;
      }

      return this.normalizeKeywordExpression(parsed.with_keywords);
    } catch (error) {
      console.error('Failed to expand keywords with LLM:', error);
      return undefined;
    }
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
  "with_genres":                  "genre names; use comma for AND, pipe for OR",
  "without_genres":               "excluded genre names; use comma for AND, pipe for OR",
  "with_networks":                "broadcast network names (not streaming); use comma for AND, pipe for OR",
  "with_companies":               "production company names; use comma for AND, pipe for OR",
  "without_companies":            "excluded production company names; use comma for AND, pipe for OR",
  "with_watch_providers":         "streaming service names; use comma for AND, pipe for OR",
  "without_watch_providers":      "excluded streaming services; use comma for AND, pipe for OR",
  "with_watch_monetization_types":"pipe-separated monetization types: flatrate|free|ads|rent|buy",
  "with_keywords":                "keyword descriptors; use comma for AND, pipe for OR",
  "without_keywords":             "excluded keywords; use comma for AND, pipe for OR",
  "with_type":                    "show type 0=Documentary,1=News,2=Miniseries,3=Reality,4=Scripted,5=TalkShow,6=Video; comma=AND, pipe=OR",
  "with_status":                  "status 0=Returning,1=Planned,2=InProduction,3=Ended,4=Cancelled,5=Pilot; comma=AND, pipe=OR",
  "with_original_language":       "ISO 639-1 code, e.g. 'en','es','ko','ja'",
  "with_origin_country":          "ISO 3166-1 code, e.g. 'US','GB','KR'",
  "language":                     "response language, default 'en-US'",
  "watch_region":                 "ISO 3166-1 alpha-2 code for watch provider filtering; convert country names to codes (e.g. 'Israel' -> 'IL', 'United Kingdom' -> 'GB', 'United States' -> 'US')",
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
- For multi-value filter fields, encode user intent as follows:
  - Use comma (,) for AND semantics (user wants all conditions at once), e.g. "drama and thriller" -> "Drama,Thriller".
  - Use pipe (|) for OR semantics (any of the values is acceptable), e.g. "drama or thriller" -> "Drama|Thriller".
  - If user says "either", "any", "one of", or clearly expresses alternatives, use pipe.
  - If user says "both", "all", "must include", "and", use comma.
- Apply the same comma/pipe rule consistently to: with_genres, without_genres, with_networks, with_companies, without_companies, with_watch_providers, without_watch_providers, with_keywords, without_keywords, with_status, with_type.
- Do not mix comma and pipe in the same field unless the user explicitly asks for grouped logic.
- Do NOT invent genres. Only use official TMDB genre names (e.g. Drama, Comedy, Action, Crime, Thriller, Sci-Fi & Fantasy, Animation, Documentary, Reality, Mystery, Family) for with_genres/without_genres. Specific themes, subjects, or professions (e.g. "lawyers", "doctors", "high school", "time travel") are NOT genres — extract them into with_keywords instead.
- Always normalize keywords in with_keywords and without_keywords to their singular base form (e.g. output "lawyer" not "lawyers", "doctor" not "doctors", "zombie" not "zombies") to maximise TMDB keyword match rates.
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
        (data.genres ?? []).map((g: { name: string; id: number }) => [
          g.name.toLowerCase(),
          g.id,
        ]),
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
   * Search TMDB for keyword IDs and optionally include near matches
   */
  private async resolveKeywordIdsWithExpansion(
    keyword: string,
    maxIds: number,
    includeRelated: boolean,
  ): Promise<number[]> {
    const tmdbToken = this.getTmdbBearerToken();
    const normalizedKeyword = keyword.toLowerCase().trim();

    if (!normalizedKeyword) {
      return [];
    }

    const cachedId = this.idCache.keywords.get(normalizedKeyword);

    // For non-expanded lookups, a cache hit is sufficient.
    if (!includeRelated && cachedId !== undefined) {
      return [cachedId];
    }

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

      if (!response.ok) {
        return cachedId !== undefined ? [cachedId] : [];
      }

      const data = await response.json();
      const results: Array<{ id: number; name: string }> = data.results ?? [];

      if (results.length === 0) {
        return cachedId !== undefined ? [cachedId] : [];
      }

      const ranked = results
        .map((result) => ({
          id: result.id,
          score: this.rankKeywordMatch(keyword, result.name),
        }))
        .sort((a, b) => b.score - a.score)
        .filter((item) => item.score > 0)
        .slice(0, includeRelated ? Math.max(1, maxIds) : 1)
        .map((item) => item.id);

      const resolvedIds = Array.from(new Set(ranked));

      if (resolvedIds.length > 0) {
        this.idCache.keywords.set(normalizedKeyword, resolvedIds[0]);
        return resolvedIds;
      }

      return cachedId !== undefined ? [cachedId] : [];
    } catch (error) {
      console.error(`Error resolving keyword IDs for ${keyword}:`, error);

      if (cachedId !== undefined) {
        return [cachedId];
      }

      return [];
    }
  }

  /**
   * Builds TMDB keyword expression, preserving top-level comma/pipe logic.
   * For includeRelated=true, each concept expands to nearby keyword IDs joined by OR.
   * 
   * Optimization: resolveKeywordIdsWithExpansion calls are parallelized per group to avoid
   * N+1 sequential API calls. Keywords within each group are resolved concurrently.
   * 
   * URL encoding note: Returns raw ID strings with | and , separators (not pre-encoded).
   * These will be automatically URL-encoded by URLSearchParams.append() without double-encoding.
   */
  private async buildKeywordFilter(
    rawKeywords: string,
    includeRelated: boolean,
  ): Promise<string | undefined> {
    const groups = this.parseAndOrGroups(rawKeywords);
    if (groups.length === 0) {
      return undefined;
    }

    const serializedGroups: string[] = [];

    for (const group of groups) {
      // Parallelize keyword resolution within each group to avoid N+1 sequencing.
      const keywordIdPromises = group.map((keyword) =>
        this.resolveKeywordIdsWithExpansion(
          keyword,
          includeRelated ? 4 : 1,
          includeRelated,
        ),
      );

      const allKeywordIds = await Promise.all(keywordIdPromises);
      const groupIds = new Set<number>();

      // Collect all resolved IDs from the parallel results.
      for (const ids of allKeywordIds) {
        for (const id of ids) {
          groupIds.add(id);
        }
      }

      if (groupIds.size > 0) {
        serializedGroups.push(Array.from(groupIds).join('|'));
      }
    }

    if (serializedGroups.length === 0) {
      return undefined;
    }

    return serializedGroups.join(',');
  }

  async orchestrateDiscoverParameters(
    parsedParams: ParsedDiscoverParams,
  ): Promise<Record<string, any>> {
    const discoverParams: Record<string, any> = {};

    // --- Watch region (needed early for provider resolution) ---
    const watchRegion = parsedParams.watch_region || 'US';
    discoverParams.watch_region = watchRegion;

    // --- Genres ---
    if (parsedParams.with_genres) {
      const genreIds = await this.resolveGenreIds(
        parsedParams.with_genres.split(',').map((g) => g.trim()),
      );
      if (genreIds.length > 0) discoverParams.with_genres = genreIds.join(',');
    }
    if (parsedParams.without_genres) {
      const genreIds = await this.resolveGenreIds(
        parsedParams.without_genres.split(',').map((g) => g.trim()),
      );
      if (genreIds.length > 0) discoverParams.without_genres = genreIds.join(',');
    }

    // --- Networks ---
    if (parsedParams.with_networks) {
      const networkIds = await this.resolveNetworkIds(
        parsedParams.with_networks.split(',').map((n) => n.trim()),
      );
      if (networkIds.length > 0) discoverParams.with_networks = networkIds.join(',');
    }

    // --- Companies ---
    if (parsedParams.with_companies) {
      const companyIds = await this.resolveNetworkIds(
        parsedParams.with_companies.split(',').map((c) => c.trim()),
      );
      if (companyIds.length > 0) discoverParams.with_companies = companyIds.join(',');
    }
    if (parsedParams.without_companies) {
      const companyIds = await this.resolveNetworkIds(
        parsedParams.without_companies.split(',').map((c) => c.trim()),
      );
      if (companyIds.length > 0) discoverParams.without_companies = companyIds.join(',');
    }

    // --- Watch providers ---
    if (parsedParams.with_watch_providers) {
      const providerIds = await this.resolveProviderIds(
        parsedParams.with_watch_providers.split(',').map((p) => p.trim()),
        watchRegion,
      );
      if (providerIds.length > 0) discoverParams.with_watch_providers = providerIds.join('|');
    }
    if (parsedParams.without_watch_providers) {
      const providerIds = await this.resolveProviderIds(
        parsedParams.without_watch_providers.split(',').map((p) => p.trim()),
        watchRegion,
      );
      if (providerIds.length > 0) {
        discoverParams.without_watch_providers = providerIds.join('|');
      }
    }
    if (parsedParams.with_watch_monetization_types) {
      discoverParams.with_watch_monetization_types = parsedParams.with_watch_monetization_types;
    }

    // --- Keywords ---
    if (parsedParams.with_keywords) {
      const withKeywordsFilter = await this.buildKeywordFilter(parsedParams.with_keywords, true);
      if (withKeywordsFilter) discoverParams.with_keywords = withKeywordsFilter;
    }
    if (parsedParams.without_keywords) {
      const withoutKeywordsFilter = await this.buildKeywordFilter(
        parsedParams.without_keywords,
        false,
      );
      if (withoutKeywordsFilter) discoverParams.without_keywords = withoutKeywordsFilter;
    }

    // --- Pass-through string / enum fields ---
    const stringFields: Array<keyof ParsedDiscoverParams> = [
      'with_original_language',
      'with_origin_country',
      'language',
      'timezone',
      'with_status',
      'with_type',
      'sort_by',
      'first_air_date_gte',
      'first_air_date_lte',
      'air_date_gte',
      'air_date_lte',
    ];
    for (const field of stringFields) {
      if (parsedParams[field] !== undefined && parsedParams[field] !== null) {
        discoverParams[field] = parsedParams[field];
      }
    }

    // --- Pass-through numeric fields (stored as strings for URLSearchParams) ---
    const numericFields: Array<keyof ParsedDiscoverParams> = [
      'first_air_date_year',
      'page',
      'with_runtime_gte',
      'with_runtime_lte',
      'vote_average_gte',
      'vote_average_lte',
      'vote_count_gte',
      'vote_count_lte',
    ];
    for (const field of numericFields) {
      if (parsedParams[field] !== undefined) {
        discoverParams[field] = String(parsedParams[field]);
      }
    }

    // --- Pass-through boolean fields ---
    const booleanFields: Array<keyof ParsedDiscoverParams> = [
      'include_adult',
      'include_null_first_air_dates',
      'screened_theatrically',
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

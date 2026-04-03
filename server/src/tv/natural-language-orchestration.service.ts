import {
  Injectable,
  InternalServerErrorException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParsedDiscoverParams, ReferenceShowDto } from './dto/natural-language-search.dto';
import { TvService } from './tv.service';

/**
 * Maps user-friendly entity names to TMDB IDs
 * This cache helps reduce API calls for common searches
 */
interface IdCache {
  genres: Map<string, number>;
  networks: Map<string, number>;
  providers: Map<string, number>;
  keywords: Map<string, number>;
  /** Tracks whether the full static list has been fetched and cached */
  genresFetched: boolean;
  providersFetched: Map<string, boolean>;
  fullShows: Map<number, any>;
  titleToId: Map<string, number>;
}

export interface EnrichedReferenceShow {
  tmdb_id: number;
  name: string;
  genres: string[];
  keywords: string[];
  original_language: string;
}

export interface MergeResult {
  params: ParsedDiscoverParams;
  /** Keyword themes ordered by importance (most specific first). Empty if no reference keywords. */
  keywordThemes: string[];
}

export interface LlmTitleResponse {
  hard_filters: {
    with_watch_providers?: string | null;
    watch_region?: string;
    with_origin_country?: string | null;
    with_original_language?: string | null;
    without_genres?: string[];
    min_year?: number | null;
    max_year?: number | null;
    with_networks?: string[];
    without_networks?: string[];
    with_companies?: string[];
    without_companies?: string[];
    min_runtime?: number | null;
    max_runtime?: number | null;
    with_status?: string[];
  };
  candidate_titles: string[];
}

@Injectable()
export class NaturalLanguageOrchestrationService {
  private idCache: IdCache = {
    genres: new Map(),
    networks: new Map(),
    providers: new Map(),
    keywords: new Map(),
    genresFetched: false,
    providersFetched: new Map(),
    fullShows: new Map(),
    titleToId: new Map(),
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly tvService: TvService,
  ) {}

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
        console.log('[expandKeywordsForRecall] LLM returned no with_keywords');
        return undefined;
      }

      const normalized = this.normalizeKeywordExpression(parsed.with_keywords);
      console.log(`[expandKeywordsForRecall] Original: "${originalWithKeywords}" → Expanded: "${normalized}"`);
      return normalized;
    } catch (error) {
      console.error('[expandKeywordsForRecall] Failed to expand keywords with LLM:', error);
      return undefined;
    }
  }

  async enrichReferenceShows(shows: ReferenceShowDto[]): Promise<EnrichedReferenceShow[]> {
    console.log(`[enrichReferenceShows] Fetching TMDB details+keywords for ${shows.length} reference show(s) (single call per show via append_to_response)...`);
    const tmdbToken = this.getTmdbBearerToken();

    const enriched = await Promise.all(
      shows.map(async (show) => {
        try {
          // Single TMDB call per show: details + keywords in one roundtrip
          const response = await fetch(
            `https://api.themoviedb.org/3/tv/${show.tmdb_id}?language=en-US&append_to_response=keywords`,
            {
              headers: {
                Authorization: `Bearer ${tmdbToken}`,
                accept: 'application/json',
              },
            },
          );

          if (!response.ok) {
            throw new Error(`TMDB responded with ${response.status}`);
          }

          const data = await response.json();

          const result: EnrichedReferenceShow = {
            tmdb_id: show.tmdb_id,
            name: data.name ?? show.name,
            genres: (data.genres ?? []).map((g: any) => g.name),
            keywords: (data.keywords?.results ?? []).map((k: any) => k.name),
            original_language: data.original_language ?? '',
          };

          console.log(`[enrichReferenceShows] "${result.name}" — genres: [${result.genres}], keywords: [${result.keywords.slice(0, 8)}], lang: ${result.original_language}`);
          return result;
        } catch (err) {
          console.error(`[enrichReferenceShows] Failed to enrich show ${show.tmdb_id} ("${show.name}"):`, err);
          return {
            tmdb_id: show.tmdb_id,
            name: show.name,
            genres: [],
            keywords: [],
            original_language: '',
          } as EnrichedReferenceShow;
        }
      }),
    );

    return enriched;
  }

  async mergeEnrichedShowsIntoParams(
    parsedParams: ParsedDiscoverParams,
    enrichedShows: EnrichedReferenceShow[],
  ): Promise<MergeResult> {
    const merged = { ...parsedParams };

    // Use thematic_keyword_groups from the consolidated LLM call as the single
    // source of truth for keywords. The LLM already grouped user + reference
    // keywords into universality-ranked themes during parseWithLlm.
    const keywordThemes = merged.thematic_keyword_groups ?? [];
    delete merged.thematic_keyword_groups;

    if (keywordThemes.length > 0) {
      merged.with_keywords = keywordThemes.join(',');
      console.log(`[mergeEnriched] Keywords from thematic groups (${keywordThemes.length} themes): "${merged.with_keywords}"`);
    }

    // Collect unique genres from reference shows
    const refGenres = new Set<string>();
    for (const show of enrichedShows) {
      for (const g of show.genres) refGenres.add(g);
    }

    // --- Smart Kids Genre Filter ---
    const hasKidsInWith = merged.with_genres?.toLowerCase().includes('kids');
    const hasKidsInWithout = merged.without_genres?.toLowerCase().includes('kids');

    if (!hasKidsInWith && !hasKidsInWithout && enrichedShows.length > 0) {
      const kidsShowCount = enrichedShows.filter(show =>
        show.genres.some(g => g.toLowerCase() === 'kids'),
      ).length;

      if (kidsShowCount === 0) {
        // Exclude Kids if 0 reference shows are Kids
        const existingWithout = merged.without_genres
          ? merged.without_genres.split(',')
          : [];
        existingWithout.push('Kids');
        merged.without_genres = existingWithout
          .map(g => g.trim())
          .filter(Boolean)
          .join(',');
        // Ensure it's removed from refGenres just in case
        for (const g of Array.from(refGenres)) {
          if (g.toLowerCase() === 'kids') refGenres.delete(g);
        }
        console.log(
          '[mergeEnriched] Auto-excluding "Kids" genre (0 kids reference shows)',
        );
      } else if (kidsShowCount > enrichedShows.length / 2) {
        // Force Kids as a strict requirement
        refGenres.add('Kids');
        console.log(
          '[mergeEnriched] Auto-including "Kids" genre (majority reference shows are kids)',
        );
      } else {
        // Minority are Kids shows -> Remove it from strict refGenres so it doesn't force a strict AND
        for (const g of Array.from(refGenres)) {
          if (g.toLowerCase() === 'kids') refGenres.delete(g);
        }
        console.log(
          '[mergeEnriched] Kids genre is minority, removing from strict refGenres',
        );
      }
    }

    // Merge genres with AND (comma) — strict, will be relaxed in later passes
    if (refGenres.size > 0) {
      const existing = merged.with_genres ?? '';
      const refGenreStr = Array.from(refGenres).join(',');
      const combined = existing ? `${existing},${refGenreStr}` : refGenreStr;
      const uniqueGenres = [...new Set(combined.split(',').map(g => g.trim()).filter(Boolean))];
      merged.with_genres = uniqueGenres.join(',');
      console.log(`[mergeEnriched] Genres after merge (AND, deduplicated): "${merged.with_genres}"`);
    }

    // Merge original_language if not already set by LLM
    if (!merged.with_original_language) {
      const langs = new Set<string>();
      for (const show of enrichedShows) {
        if (show.original_language) langs.add(show.original_language);
      }
      if (langs.size === 1) {
        merged.with_original_language = Array.from(langs)[0];
        console.log(`[mergeEnriched] Language set from reference: "${merged.with_original_language}"`);
      }
    }

    return { params: merged, keywordThemes };
  }

  /**
   * Low-level LLM call wrapper for Groq API.
   */
  private async callLlmApi(
    prompt: string,
    options: { temperature?: number; max_tokens?: number; systemPrompt?: string } = {},
  ): Promise<string> {
    const groqApiKey = this.getGroqApiKey();
    const groqModel = this.getGroqModel();

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens ?? 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Groq API error:', error);
      throw new BadGatewayException('Failed to call LLM');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new BadGatewayException('Empty response from LLM');
    }
    return content;
  }

  /**
   * Calls Groq API to brainstorm candidate TV show titles and extract hard filters.
   * Returns { hard_filters, candidate_titles } for the Title-First architecture.
   */
  async parseWithLlm(query: string, referenceShows: string[] = [], defaultRegion: string = 'US'): Promise<LlmTitleResponse> {
    const systemPrompt = `You are a TV show recommendation engine. Understand the user's semantic request and brainstorm EXACT TV show titles that match perfectly.

If reference shows are provided, your recommended candidate titles MUST be highly similar to them in tone, genre, vibe, and audience appeal.

OUTPUT JSON FORMAT:
{
  "hard_filters": {
    "with_watch_providers": "String name of streaming service if requested. Null if none.",
    "watch_region": "2-letter country code (e.g., 'IL', 'US'). Default to '${defaultRegion}' unless the user specifies otherwise.",
    "with_origin_country": "2-letter ISO country code. Null if none.",
    "with_original_language": "2-letter ISO language code. Null if none.",
    "without_genres": "Array of official TMDB genres to EXCLUDE. Empty if none.",
    "min_year": "Integer, minimum release year. Null if none.",
    "max_year": "Integer, maximum release year. Null if none.",
    "with_networks": "Array of network names to include (e.g., ['HBO', 'AMC']). Empty if none.",
    "without_networks": "Array of network names to EXCLUDE. Empty if none.",
    "with_companies": "Array of production company names to include. Empty if none.",
    "without_companies": "Array of production company names to EXCLUDE. Empty if none.",
    "min_runtime": "Integer, minimum episode runtime in minutes. Null if none.",
    "max_runtime": "Integer, maximum episode runtime in minutes (e.g., 30 for sitcoms). Null if none.",
    "with_status": "Array of exact statuses if requested. Allowed values: ['Returning Series', 'Planned', 'In Production', 'Ended', 'Canceled', 'Pilot']. Empty if none."
  },
  "candidate_titles": [
    "Title of Show 1 (Year)",
    "... generate EXACTLY 30 to 40 highly relevant titles. Include the release year in parentheses."
  ]
}

CRITICAL:
- PLATFORM AWARENESS: Generate a MASSIVE list (30-40 titles). If a platform is requested, bias heavily toward its known catalog.
- SEPARATE REGION FROM CONTENT: "Netflix Israel" means global shows available in IL. Do not restrict "with_origin_country" or "with_original_language" unless the user explicitly asks for "Israeli shows" or "Hebrew shows".
- Output ONLY valid JSON.`;

    let userMessage = '';
    if (query && referenceShows.length > 0) {
      userMessage = `Recommend TV shows for this request: "${query}" while using these as a stylistic anchor: ${referenceShows.join(', ')}`;
    } else if (query) {
      userMessage = `Recommend TV shows for this request: "${query}"`;
    } else if (referenceShows.length > 0) {
      userMessage = `The user didn't provide a text query. Based EXCLUSIVELY on these reference shows, brainstorm 30-40 similar candidates: ${referenceShows.join(', ')}`;
    }

    try {
      const content = await this.callLlmApi(userMessage, {
        systemPrompt,
        temperature: 0.3,
        max_tokens: 1500,
      });

      console.log('[parseWithLlm] LLM raw response:', content);

      const cleaned = content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned) as LlmTitleResponse;
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('[parseWithLlm] Failed to parse LLM response as JSON:', error);
        throw new BadGatewayException('Invalid response format from LLM');
      }
      throw error;
    }
  }

  /**
   * Resolves human-readable provider names in hard_filters to TMDB IDs.
   */
  async resolveParsedParams(hardFilters: Record<string, any>): Promise<Record<string, any>> {
    const discoverParams: Record<string, any> = {};
    const watchRegion = hardFilters.watch_region || 'US';

    if (hardFilters.with_watch_providers) {
      const providerIds = await this.resolveProviderIds(
        hardFilters.with_watch_providers.split(',').map((p: string) => p.trim()),
        watchRegion,
      );
      if (providerIds.length > 0) discoverParams.with_watch_providers = providerIds.join('|');
      discoverParams.watch_region = watchRegion;
      console.log(`[resolveParsedParams] Providers: "${hardFilters.with_watch_providers}" → [${providerIds}]`);
    }

    return discoverParams;
  }

  /**
   * Maps LLM-brainstormed titles to TMDB objects via search, fetches full details
   * with watch/providers in a single call, then validates against all hard filters.
   */
  async resolveAndValidateTitles(
    titles: string[],
    filters: any,
  ): Promise<any[]> {
    const tmdbToken = this.getTmdbBearerToken();
    const region = filters.watch_region || 'US';

    // Step 1: Map titles to TMDB IDs concurrently (with cache)
    const searchPromises = titles.map(async (titleWithYear) => {
      const cleanTitle = titleWithYear.replace(/\s*\(\d{4}\)\s*$/, '').trim();
      const cacheKey = cleanTitle.toLowerCase();

      // Fast return from cache
      if (this.idCache.titleToId.has(cacheKey)) {
        return this.idCache.titleToId.get(cacheKey);
      }

      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(cleanTitle)}&page=1`,
          { headers: { Authorization: `Bearer ${tmdbToken}`, accept: 'application/json' } },
        );
        const data = await res.json();
        const id = data.results?.[0]?.id || null;

        // Save to cache if found
        if (id) {
          this.idCache.titleToId.set(cacheKey, id);
        }
        return id;
      } catch (e) {
        return null;
      }
    });

    const ids = (await Promise.all(searchPromises)).filter(Boolean);

    // Step 2: Fetch Full Details + Providers concurrently for found IDs
    const detailsPromises = ids.map(async (id) => {
      // Return from cache if available
      if (this.idCache.fullShows.has(id)) {
        return this.idCache.fullShows.get(id);
      }
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/tv/${id}?append_to_response=watch/providers`,
          { headers: { Authorization: `Bearer ${tmdbToken}`, accept: 'application/json' } },
        );
        const data = await res.json();
        // Save to cache if successful
        if (data && !data.success?.toString().includes('false')) {
          this.idCache.fullShows.set(id, data);
        }
        return data;
      } catch (e) {
        return null;
      }
    });

    let fullShows = (await Promise.all(detailsPromises)).filter(
      (show) => show && !show.success?.toString().includes('false'),
    );

    // Step 3: Ruthless Full-Object Validation
    fullShows = fullShows.filter((show: any) => {
      // Origin Country
      if (filters.with_origin_country && (!show.origin_country || !show.origin_country.includes(filters.with_origin_country.toUpperCase()))) {
        return false;
      }

      // Original Language
      if (filters.with_original_language && show.original_language !== filters.with_original_language.toLowerCase()) {
        return false;
      }

      // Excluded Genres (show.genres is an array of objects in Full Details)
      if (filters.excludedGenreIds?.length > 0) {
        const hasExcluded = show.genres?.some((g: any) => filters.excludedGenreIds.includes(g.id));
        if (hasExcluded) return false;
      }

      // Years
      const airYear = show.first_air_date ? parseInt(show.first_air_date.substring(0, 4), 10) : null;
      if (airYear) {
        if (filters.min_year && airYear < filters.min_year) return false;
        if (filters.max_year && airYear > filters.max_year) return false;
      }

      // Status
      if (filters.with_status?.length > 0 && !filters.with_status.includes(show.status)) {
        return false;
      }

      // Runtime (episode_run_time is an array, check average)
      if (filters.min_runtime || filters.max_runtime) {
        const runtimes: number[] = show.episode_run_time || [];
        const avgRuntime = runtimes.length ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length : 0;
        if (avgRuntime > 0) {
          if (filters.min_runtime && avgRuntime < filters.min_runtime) return false;
          if (filters.max_runtime && avgRuntime > filters.max_runtime) return false;
        }
      }

      // Networks (WITH and WITHOUT)
      const networkNames = (show.networks || []).map((n: any) => n.name.toLowerCase());
      if (filters.with_networks?.length > 0 && !filters.with_networks.some((n: string) => networkNames.includes(n.toLowerCase()))) {
        return false;
      }
      if (filters.without_networks?.length > 0 && filters.without_networks.some((n: string) => networkNames.includes(n.toLowerCase()))) {
        return false;
      }

      // Companies (WITH and WITHOUT)
      const companyNames = (show.production_companies || []).map((c: any) => c.name.toLowerCase());
      if (filters.with_companies?.length > 0 && !filters.with_companies.some((c: string) => companyNames.includes(c.toLowerCase()))) {
        return false;
      }
      if (filters.without_companies?.length > 0 && filters.without_companies.some((c: string) => companyNames.includes(c.toLowerCase()))) {
        return false;
      }

      // Providers
      if (filters.requiredProviderIds?.length > 0) {
        const regionData = show['watch/providers']?.results?.[region.toUpperCase()];
        if (!regionData) return false;
        const availableIds = [
          ...(regionData.flatrate || []),
          ...(regionData.rent || []),
          ...(regionData.buy || []),
        ].map((p: any) => p.provider_id);
        if (!filters.requiredProviderIds.some((id: number) => availableIds.includes(id))) return false;
      }

      return true;
    });

    console.log(`[Validation] Shows remaining after deep hard fact checks: ${fullShows.length}`);
    return fullShows;
  }

  /**
   * Search TMDB for genre ID by name.
   * Caches the full genre list on first call to avoid repeated API hits.
   */
  async resolveGenreIds(genreNames: string[]): Promise<number[]> {
    // Populate cache on first call
    if (!this.idCache.genresFetched) {
      const tmdbToken = this.getTmdbBearerToken();
      try {
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
        for (const g of data.genres ?? []) {
          this.idCache.genres.set(g.name.toLowerCase(), g.id);
        }
        this.idCache.genresFetched = true;
        console.log(`[resolveGenreIds] Cached ${this.idCache.genres.size} genres from TMDB`);
      } catch (error) {
        console.error('Error fetching genre list from TMDB:', error);
      }
    }

    const ids: number[] = [];
    for (const genreName of genreNames) {
      const lowerName = genreName.toLowerCase().trim();
      const id = this.idCache.genres.get(lowerName);
      if (id !== undefined) {
        ids.push(id);
      }
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
   * Search TMDB for watch provider ID by name.
   * Caches the full provider list per region on first call.
   */
  private async resolveProviderIds(
    providerNames: string[],
    watchRegion: string = 'US',
  ): Promise<number[]> {
    const regionKey = watchRegion.toUpperCase();

    // Populate cache for this region on first call
    if (!this.idCache.providersFetched.get(regionKey)) {
      const tmdbToken = this.getTmdbBearerToken();
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/watch/providers/tv?language=en-US&watch_region=${regionKey}`,
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
        for (const p of data.results ?? []) {
          // Store with region-prefixed key to avoid collisions across regions
          this.idCache.providers.set(`${regionKey}:${p.provider_name.toLowerCase()}`, p.provider_id);
        }
        this.idCache.providersFetched.set(regionKey, true);
        console.log(`[resolveProviderIds] Cached providers for region ${regionKey}`);
      } catch (error) {
        console.error('Error fetching provider list from TMDB:', error);
      }
    }

    const ids: number[] = [];
    for (const providerName of providerNames) {
      const lowerName = providerName.toLowerCase().trim();
      const id = this.idCache.providers.get(`${regionKey}:${lowerName}`);
      if (id !== undefined) {
        ids.push(id);
      }
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
    console.log('[orchestrate] Starting ID resolution for parsed params...');

    // --- Watch region (only relevant when filtering by watch providers) ---
    const watchRegion = parsedParams.watch_region || 'US';
    if (parsedParams.with_watch_providers || parsedParams.without_watch_providers) {
      discoverParams.watch_region = watchRegion;
    }

    // --- Genres ---
    if (parsedParams.with_genres) {
      const andGroups = parsedParams.with_genres.split(',').map((group) => group.trim());
      const resolvedGroups: string[] = [];
      for (const group of andGroups) {
        const orNames = group.split('|').map((g) => g.trim()).filter(Boolean);
        const ids = await this.resolveGenreIds(orNames);
        if (ids.length > 0) resolvedGroups.push(ids.join('|'));
      }
      if (resolvedGroups.length > 0) discoverParams.with_genres = resolvedGroups.join(',');
      console.log(`[orchestrate] Genres: "${parsedParams.with_genres}" → IDs: "${discoverParams.with_genres ?? '(none)'}"`);
    }
    if (parsedParams.without_genres) {
      const andGroups = parsedParams.without_genres.split(',').map((group) => group.trim());
      const resolvedGroups: string[] = [];
      for (const group of andGroups) {
        const orNames = group.split('|').map((g) => g.trim()).filter(Boolean);
        const ids = await this.resolveGenreIds(orNames);
        if (ids.length > 0) resolvedGroups.push(ids.join('|'));
      }
      if (resolvedGroups.length > 0) discoverParams.without_genres = resolvedGroups.join(',');
      console.log(`[orchestrate] Excluded genres: "${parsedParams.without_genres}" → IDs: "${discoverParams.without_genres ?? '(none)'}"`);
    }

    // --- Networks ---
    if (parsedParams.with_networks) {
      const networkIds = await this.resolveNetworkIds(
        parsedParams.with_networks.split(',').map((n) => n.trim()),
      );
      if (networkIds.length > 0) discoverParams.with_networks = networkIds.join(',');
      console.log(`[orchestrate] Networks: "${parsedParams.with_networks}" → IDs: [${networkIds}]`);
    }

    // --- Companies ---
    if (parsedParams.with_companies) {
      const companyIds = await this.resolveNetworkIds(
        parsedParams.with_companies.split(',').map((c) => c.trim()),
      );
      if (companyIds.length > 0) discoverParams.with_companies = companyIds.join(',');
      console.log(`[orchestrate] Companies: "${parsedParams.with_companies}" → IDs: [${companyIds}]`);
    }
    if (parsedParams.without_companies) {
      const companyIds = await this.resolveNetworkIds(
        parsedParams.without_companies.split(',').map((c) => c.trim()),
      );
      if (companyIds.length > 0) discoverParams.without_companies = companyIds.join(',');
      console.log(`[orchestrate] Excluded companies: "${parsedParams.without_companies}" → IDs: [${companyIds}]`);
    }

    // --- Watch providers ---
    if (parsedParams.with_watch_providers) {
      const providerIds = await this.resolveProviderIds(
        parsedParams.with_watch_providers.split(',').map((p) => p.trim()),
        watchRegion,
      );
      if (providerIds.length > 0) discoverParams.with_watch_providers = providerIds.join('|');
      console.log(`[orchestrate] Watch providers: "${parsedParams.with_watch_providers}" → IDs: [${providerIds}]`);
    }
    if (parsedParams.without_watch_providers) {
      const providerIds = await this.resolveProviderIds(
        parsedParams.without_watch_providers.split(',').map((p) => p.trim()),
        watchRegion,
      );
      if (providerIds.length > 0) {
        discoverParams.without_watch_providers = providerIds.join('|');
      }
      console.log(`[orchestrate] Excluded watch providers: "${parsedParams.without_watch_providers}" → IDs: [${providerIds}]`);
    }
    if (parsedParams.with_watch_monetization_types) {
      discoverParams.with_watch_monetization_types = parsedParams.with_watch_monetization_types;
    }

    // --- Keywords ---
    if (parsedParams.with_keywords) {
      const withKeywordsFilter = await this.buildKeywordFilter(parsedParams.with_keywords, true);
      if (withKeywordsFilter) discoverParams.with_keywords = withKeywordsFilter;
      console.log(`[orchestrate] Keywords: "${parsedParams.with_keywords}" → resolved filter: "${withKeywordsFilter}"`);
    }
    if (parsedParams.without_keywords) {
      const withoutKeywordsFilter = await this.buildKeywordFilter(
        parsedParams.without_keywords,
        false,
      );
      if (withoutKeywordsFilter) discoverParams.without_keywords = withoutKeywordsFilter;
      console.log(`[orchestrate] Excluded keywords: "${parsedParams.without_keywords}" → resolved filter: "${withoutKeywordsFilter}"`);
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

}

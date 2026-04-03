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

@Injectable()
export class NaturalLanguageOrchestrationService {
  private idCache: IdCache = {
    genres: new Map(),
    networks: new Map(),
    providers: new Map(),
    keywords: new Map(),
    genresFetched: false,
    providersFetched: new Map(),
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
   * Calls Groq API to parse natural language and extract TV show parameters
   * Returns a JSON-parseable string with discovered parameters
   */
  async parseWithLlm(query: string, enrichedShows?: EnrichedReferenceShow[]): Promise<ParsedDiscoverParams> {
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
  "page":                         1,
  "thematic_keyword_groups":      ["theme1_kw1|theme1_kw2", "theme2_kw1|theme2_kw2", "theme3_kw1"]
}

KEYWORD HANDLING — thematic_keyword_groups (IMPORTANT):
- Do NOT use "with_keywords". Instead, output ALL keyword descriptors in "thematic_keyword_groups".
- Group all relevant keywords into exactly 2 to 4 thematic clusters.
- TMDB LOGIC: Different array elements are treated as REQUIRED (AND). Pipes (|) inside a single string are treated as OPTIONAL (OR).
- RULE 1 (Split Distinct Pillars): If a show's identity is a mix of two DISTINCT concepts (e.g., "business/wealth" AND "family"), you MUST put them in separate elements. DO NOT group them with a pipe, or TMDB will return wrong shows.
- RULE 2 (Group Synonyms): If concepts are highly similar synonyms (e.g., "friends", "sitcom", "roommates"), group them TOGETHER in Element [0] using pipes.
- RULE 3 (Hyponym/Sub-type Expansion): If the user asks for a broad generic category (e.g., "sports", "hospital", "monster", "police"), do NOT just use abstract synonyms. You MUST explicitly generate specific sub-types (hyponyms) separated by pipes in Element [0].
  - Example for 'sports': "sports|football|basketball|tennis|baseball"
  - Example for 'hospital': "hospital|clinic|medical center|ER|doctor"
  - Example for 'monster': "monster|vampire|werewolf|zombie|alien"
  This is STRICTLY REQUIRED because the TMDB database relies on highly specific tags. If a user asks for a broad physical location or concept, list its most common specific variations.
- CRITICAL ORDERING BY UNIQUENESS (This dictates fallback success):
  - Element [0] MUST be the MOST UNIQUE, SPECIFIC, and DEFINING core pillar (e.g., "media tycoon|businessman|white collar criminal"). Never put broad/generic terms like "family" or "relationships" in Element [0].
  - Element [1] = The broader/secondary core pillar (e.g., "dysfunctional family").
  - Element [Last] = Settings/locations (e.g., "new york city"). MUST come last so they are dropped first.
- DO NOT split multi-word TMDB keywords into single words (e.g., use "dysfunctional family", never "family|dysfunctional").

Rules:
- Distinguish with_networks (broadcast: HBO, BBC, AMC) from with_watch_providers (streaming: Netflix, Prime Video, Disney Plus, Apple TV+, Hulu).
- For multi-value filter fields, encode user intent as follows:
  - Use comma (,) for AND semantics (user wants all conditions at once), e.g. "drama and thriller" -> "Drama,Thriller".
  - Use pipe (|) for OR semantics (any of the values is acceptable), e.g. "drama or thriller" -> "Drama|Thriller".
  - If user says "either", "any", "one of", or clearly expresses alternatives, use pipe.
  - If user says "both", "all", "must include", "and", use comma.
- Apply the same comma/pipe rule consistently to: with_genres, without_genres, with_networks, with_companies, without_companies, with_watch_providers, without_watch_providers, without_keywords, with_status, with_type.
- Do not mix comma and pipe in the same field unless the user explicitly asks for grouped logic.
- Do NOT invent genres. Only use official TMDB genre names (e.g. Drama, Comedy, Action, Crime, Thriller, Sci-Fi & Fantasy, Animation, Documentary, Reality, Mystery, Family) for with_genres/without_genres. Specific themes, subjects, or professions (e.g. "lawyers", "doctors", "high school", "time travel") are NOT genres — extract them into thematic_keyword_groups instead.
- Never include comments or extra text — pure JSON only.`;

    let userMessage: string;
    if (query) {
      userMessage = `Extract TV show search parameters from this request: "${query}"`;
    } else {
      userMessage = `The user did not provide a text query. Instead, they selected reference shows from their watchlist. Analyze the reference shows below and generate search parameters (especially thematic_keyword_groups) based on the overlapping themes, genres, and keywords across these shows.`;
    }

    if (enrichedShows && enrichedShows.length > 0) {
      const showDescriptions = enrichedShows.map((s) => {
        const parts = [`- "${s.name}"`];
        if (s.genres.length) parts.push(`  Genres: ${s.genres.join(', ')}`);
        if (s.keywords.length) parts.push(`  Keywords/Themes: ${s.keywords.slice(0, 10).join(', ')}`);
        if (s.original_language) parts.push(`  Language: ${s.original_language}`);
        return parts.join('\n');
      }).join('\n\n');
      userMessage += `\n\nThe user selected these shows from their watchlist as reference for what they enjoy. Use their genres, keywords, and language to understand the user's taste and incorporate common patterns into the search parameters. When building thematic_keyword_groups, consider which keywords are shared across multiple reference shows (those should go in Theme 1) vs. niche to a single show (those go last):\n\n${showDescriptions}`;
    }

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

      console.log('[parseWithLlm] LLM raw response:', content);

      // Strip markdown code fences if the LLM wrapped the JSON in ```json ... ```
      const cleaned = content.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '').trim();

      // Parse the JSON response
      const parsedParams = JSON.parse(cleaned) as ParsedDiscoverParams;
      return parsedParams;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('[parseWithLlm] Failed to parse LLM response as JSON:', error);
        throw new BadGatewayException('Invalid response format from LLM');
      }
      throw error;
    }
  }

  /**
   * Search TMDB for genre ID by name.
   * Caches the full genre list on first call to avoid repeated API hits.
   */
  private async resolveGenreIds(genreNames: string[]): Promise<number[]> {
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

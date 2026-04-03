import { Controller, Get, Post, Param, ParseIntPipe, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchTvDto } from './dto/search-tv.dto';
import { DiscoverTvDto } from './dto/discover-tv.dto';
import { NaturalLanguageSearchDto } from './dto/natural-language-search.dto';
import { TvService } from './tv.service';
import { NaturalLanguageOrchestrationService } from './natural-language-orchestration.service';

@Controller('tv')
@UseGuards(JwtAuthGuard)
export class TvController {
  constructor(
    private readonly tvService: TvService,
    private readonly nlService: NaturalLanguageOrchestrationService,
  ) {}

  private mergeDiscoverResponses(existing: any, extra: any, targetCount: number) {
    const existingResults = Array.isArray(existing?.results) ? existing.results : [];
    const extraResults = Array.isArray(extra?.results) ? extra.results : [];

    const seenIds = new Set<number>(existingResults.map((s: any) => s.id));
    const merged = [...existingResults];

    for (const show of extraResults) {
      if (!seenIds.has(show.id)) {
        seenIds.add(show.id);
        merged.push(show);
      }
    }

    const trimmed = merged.slice(0, targetCount);

    return {
      page: 1,
      results: trimmed,
      total_pages: 1,
      total_results: trimmed.length,
    };
  }

  @Get('search')
  search(@Query() dto: SearchTvDto) {
    return this.tvService.search(dto.query);
  }

  @Post('discover-natural')
  async discoverNatural(@Body() dto: NaturalLanguageSearchDto) {
    const targetCount = 20;
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const query = dto.query?.trim() || '';
    const log = (msg: string, ...args: any[]) => console.log(`[discover-natural][${requestId}] ${msg}`, ...args);

    log('=== NEW REQUEST ===');
    log(`Query: "${query}"`);
    if (dto.referenceShows?.length) {
      log(`Reference shows (${dto.referenceShows.length}):`, dto.referenceShows.map((s) => s.name));
    } else {
      log('No reference shows provided');
    }

    if (!query && !dto.referenceShows?.length) {
      return { page: 1, results: [], total_pages: 0, total_results: 0 };
    }

    // Enrich reference shows with TMDB data
    let enrichedShows;
    if (dto.referenceShows?.length) {
      enrichedShows = await this.nlService.enrichReferenceShows(dto.referenceShows);
      log(`Enriched ${enrichedShows.length} reference show(s)`);
    }

    // Collect reference show IDs to exclude from results
    const excludeIds = new Set<number>(dto.referenceShows?.map((s) => s.tmdb_id) ?? []);

    // Parse query with LLM if there is a text query OR enriched reference shows
    let llmParams: Record<string, any> = {};
    if (query || enrichedShows?.length) {
      log('Calling LLM to parse query...');
      llmParams = await this.nlService.parseWithLlm(query, enrichedShows);
      log('LLM parsed params:', JSON.stringify(llmParams, null, 2));
    }

    // Merge reference data into params (uses thematic grouping for keywords)
    const mergeResult = await this.nlService.mergeEnrichedShowsIntoParams(llmParams, enrichedShows || []);
    let mergedParams: Record<string, any> = mergeResult.params;
    let keywordThemes: string[] = mergeResult.keywordThemes;
    log('Merged params:', JSON.stringify(mergedParams, null, 2));
    if (keywordThemes.length > 0) {
      log(`Keyword themes (${keywordThemes.length}):`, keywordThemes);
    }

    let accumulated = { page: 1, results: [] as any[], total_pages: 0, total_results: 0 };

    const runPass = async (passName: string, params: Record<string, any>) => {
      const discoverParams = await this.nlService.orchestrateDiscoverParameters(params);
      log(`${passName} — TMDB params:`, JSON.stringify(discoverParams, null, 2));
      const response = await this.tvService.discover(discoverParams);
      const filtered = {
        ...response,
        results: (response.results ?? []).filter((s: any) => !excludeIds.has(s.id)),
      };
      accumulated = this.mergeDiscoverResponses(accumulated, filtered, targetCount);
      log(`${passName} — got ${filtered.results?.length ?? 0} new, total: ${accumulated.results.length}/${targetCount}`);
      return accumulated.results.length;
    };

    // Helper: build with_keywords from a subset of themes (comma-joined = AND between themes)
    const themesToKeywords = (themes: string[]) => themes.join(',');
    const genresAsOr = (genres?: string) => genres?.replace(/,/g, '|');

    // === Pass 1 (Strict): Genres AND + All keyword themes required ===
    let count = await runPass('Pass 1 (genres AND, all themes)', mergedParams);
    if (count >= targetCount) { log('=== DONE ==='); return accumulated; }

    // === Pass 2 (Relaxed Genres): Genres OR + All keyword themes required ===
    if (mergedParams.with_genres?.includes(',')) {
      const p2 = { ...mergedParams, with_genres: genresAsOr(mergedParams.with_genres) };
      count = await runPass('Pass 2 (genres OR, all themes)', p2);
      if (count >= targetCount) { log('=== DONE ==='); return accumulated; }
    }

    // === Pass 3 (Strict Themes): Genres OR + Top 2 themes ANDed ===
    if (keywordThemes.length > 1) {
      const p3 = {
        ...mergedParams,
        with_keywords: themesToKeywords(keywordThemes.slice(0, 2)),
        with_genres: genresAsOr(mergedParams.with_genres),
      };
      count = await runPass('Pass 3 (genres OR, top 2 themes AND)', p3);
      if (count >= targetCount) { log('=== DONE ==='); return accumulated; }
    }

    // === Pass 4 (Primary Niche Core): Genres AND + Theme 0 only ===
    if (keywordThemes.length > 0) {
      const p4 = {
        ...mergedParams,
        with_keywords: keywordThemes[0],
        with_genres: mergedParams.with_genres, // Strict AND genres
      };
      count = await runPass('Pass 4 (genres AND, theme 0 only)', p4);
      if (count >= targetCount) { log('=== DONE ==='); return accumulated; }
    }

    // === Pass 5 (Primary Niche Core Relaxed): Genres OR + Theme 0 only ===
    if (keywordThemes.length > 0) {
      const p5 = {
        ...mergedParams,
        with_keywords: keywordThemes[0],
        with_genres: genresAsOr(mergedParams.with_genres),
      };
      count = await runPass('Pass 5 (genres OR, theme 0 only)', p5);
      if (count >= targetCount) { log('=== DONE ==='); return accumulated; }
    }

    // === Pass 6 (Secondary Core Fallback): Genres OR + Theme 1 only ===
    if (keywordThemes.length > 1) {
      const p6 = {
        ...mergedParams,
        with_keywords: keywordThemes[1],
        with_genres: genresAsOr(mergedParams.with_genres),
      };
      count = await runPass('Pass 6 (genres OR, theme 1 only)', p6);
      if (count >= targetCount) { log('=== DONE ==='); return accumulated; }
    }

    // === Pass 7: Drop keywords entirely, genres OR only ===
    if (mergedParams.with_genres) {
      const { with_keywords: _, ...rest } = mergedParams;
      const p7 = { ...rest, with_genres: genresAsOr(mergedParams.with_genres) };
      count = await runPass('Pass 7 (genres only, no keywords)', p7);
    }

    log(`=== DONE === Total results: ${accumulated.results.length}`);
    if (accumulated.results.length > 0) {
      log('Top results:', accumulated.results.slice(0, 5).map((s: any) => `${s.name} (${s.id})`));
    }
    return accumulated;
  }

  @Get('discover')
  discover(@Query() dto: DiscoverTvDto) {
    return this.tvService.discover(dto);
  }

  @Get('providers/watch')
  watchProviders() {
    return this.tvService.getWatchProviders();
  }

  @Get('companies/production')
  productionCompanies() {
    return this.tvService.getProductionCompanies();
  }

  @Get(':id')
  details(@Param('id', ParseIntPipe) id: number) {
    return this.tvService.getDetails(id);
  }

  @Get(':id/videos')
  videos(@Param('id', ParseIntPipe) id: number) {
    return this.tvService.getVideos(id);
  }
}
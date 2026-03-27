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

  private mergeDiscoverResponses(base: any, extra: any, targetCount: number) {
    const baseResults = Array.isArray(base?.results) ? base.results : [];
    const extraResults = Array.isArray(extra?.results) ? extra.results : [];

    const mergedById = new Map<number, any>();
    for (const show of baseResults) {
      mergedById.set(show.id, show);
    }
    for (const show of extraResults) {
      mergedById.set(show.id, show);
    }

    const mergedResults = Array.from(mergedById.values())
      .sort((a, b) => Number(b.popularity ?? 0) - Number(a.popularity ?? 0))
      .slice(0, targetCount);

    return {
      page: Number(base?.page ?? 1),
      results: mergedResults,
      total_pages: Math.max(Number(base?.total_pages ?? 1), Number(extra?.total_pages ?? 1), 1),
      total_results: mergedResults.length,
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
    console.log(`[discover-natural][${requestId}] === NEW REQUEST ===`);
    console.log(`[discover-natural][${requestId}] Query: "${dto.query}"`);
    if (dto.referenceShows?.length) {
      console.log(`[discover-natural][${requestId}] Reference shows (${dto.referenceShows.length}):`, dto.referenceShows.map((s) => s.name));
    } else {
      console.log(`[discover-natural][${requestId}] No reference shows provided`);
    }

    // Enrich reference shows with TMDB data if provided
    let enrichedShows;
    if (dto.referenceShows?.length) {
      enrichedShows = await this.nlService.enrichReferenceShows(dto.referenceShows);
      console.log(`[discover-natural][${requestId}] Enriched ${enrichedShows.length} reference show(s) with TMDB genres/keywords/networks`);
    }

    // First pass: strict interpretation from the user's prompt.
    console.log(`[discover-natural][${requestId}] Pass 1 (strict) — calling LLM...`);
    const parsedParams = await this.nlService.parseWithLlm(dto.query, enrichedShows);
    console.log(`[discover-natural][${requestId}] Pass 1 — LLM parsed params:`, JSON.stringify(parsedParams, null, 2));

    // Merge enriched reference show data (genres, keywords) directly into parsed params
    const finalParsedParams = enrichedShows?.length
      ? this.nlService.mergeEnrichedShowsIntoParams(parsedParams, enrichedShows)
      : parsedParams;
    if (enrichedShows?.length) {
      console.log(`[discover-natural][${requestId}] Pass 1 — params after reference merge:`, JSON.stringify(finalParsedParams, null, 2));
    }

    const discoverParams = await this.nlService.orchestrateDiscoverParameters(finalParsedParams);
    console.log(`[discover-natural][${requestId}] Pass 1 — resolved TMDB discover params:`, JSON.stringify(discoverParams, null, 2));

    const firstResponse = await this.tvService.discover(discoverParams);

    let mergedResponse = firstResponse;
    let currentCount = Array.isArray(firstResponse?.results) ? firstResponse.results.length : 0;
    console.log(`[discover-natural][${requestId}] Pass 1 — results: ${currentCount}/${targetCount}`);
    if (currentCount > 0) {
      console.log(`[discover-natural][${requestId}] Pass 1 — top results:`, firstResponse.results.slice(0, 5).map((s: any) => `${s.name} (${s.id})`));
    }

    if (!finalParsedParams.with_keywords || currentCount >= targetCount) {
      console.log(
        `[discover-natural][${requestId}] === DONE (single pass) === Reason: ${
          !finalParsedParams.with_keywords ? 'no keywords to expand' : `already have ${currentCount} results`
        }`,
      );
      return mergedResponse;
    }

    // Second pass: semantic expansion of keyword intent using Groq.
    console.log(`[discover-natural][${requestId}] Pass 2 (expanded) — original keywords: "${finalParsedParams.with_keywords}"`);
    const expandedKeywords = await this.nlService.expandKeywordsForRecall(
      dto.query,
      finalParsedParams.with_keywords,
      currentCount,
      targetCount,
    );

    if (expandedKeywords && expandedKeywords !== finalParsedParams.with_keywords) {
      console.log(`[discover-natural][${requestId}] Pass 2 — expanded keywords: "${expandedKeywords}"`);
      const expandedParsedParams = {
        ...finalParsedParams,
        with_keywords: expandedKeywords,
      };
      const expandedDiscoverParams =
        await this.nlService.orchestrateDiscoverParameters(expandedParsedParams);
      console.log(`[discover-natural][${requestId}] Pass 2 — resolved TMDB discover params:`, JSON.stringify(expandedDiscoverParams, null, 2));
      const expandedResponse = await this.tvService.discover(expandedDiscoverParams);

      mergedResponse = this.mergeDiscoverResponses(mergedResponse, expandedResponse, targetCount);
      currentCount = mergedResponse.results.length;
      console.log(`[discover-natural][${requestId}] Pass 2 — merged results: ${currentCount}/${targetCount}`);
    } else {
      console.log(`[discover-natural][${requestId}] Pass 2 — skipped (keywords unchanged or empty)`);
    }

    // Third pass: if still sparse and original expression used strict AND, relax to OR.
    if (currentCount < targetCount && finalParsedParams.with_keywords.includes(',')) {
      const relaxedKeywords = finalParsedParams.with_keywords.replace(/,/g, '|');
      console.log(`[discover-natural][${requestId}] Pass 3 (relaxed OR) — keywords: "${relaxedKeywords}"`);
      const relaxedParsedParams = {
        ...finalParsedParams,
        with_keywords: relaxedKeywords,
      };
      const relaxedDiscoverParams =
        await this.nlService.orchestrateDiscoverParameters(relaxedParsedParams);
      console.log(`[discover-natural][${requestId}] Pass 3 — resolved TMDB discover params:`, JSON.stringify(relaxedDiscoverParams, null, 2));
      const relaxedResponse = await this.tvService.discover(relaxedDiscoverParams);

      mergedResponse = this.mergeDiscoverResponses(mergedResponse, relaxedResponse, targetCount);
      console.log(`[discover-natural][${requestId}] Pass 3 — final merged results: ${mergedResponse.results.length}/${targetCount}`);
    } else if (currentCount < targetCount) {
      console.log(
        `[discover-natural][${requestId}] Pass 3 — skipped (no AND operators in keywords). Results: ${currentCount}`,
      );
    }

    console.log(`[discover-natural][${requestId}] === DONE === Total results: ${mergedResponse.results.length}`);
    if (mergedResponse.results.length > 0) {
      console.log(`[discover-natural][${requestId}] Final top results:`, mergedResponse.results.slice(0, 5).map((s: any) => `${s.name} (${s.id})`));
    }
    return mergedResponse;
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
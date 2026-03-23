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
    console.log(`[discover-natural] Request ${requestId} started for query:`, dto.query);

    // First pass: strict interpretation from the user's prompt.
    const parsedParams = await this.nlService.parseWithLlm(dto.query);
    const discoverParams = await this.nlService.orchestrateDiscoverParameters(parsedParams);
    console.log(`[discover-natural] Request ${requestId} Pass 1 (strict) completed`);
    const firstResponse = await this.tvService.discover(discoverParams);

    let mergedResponse = firstResponse;
    let currentCount = Array.isArray(firstResponse?.results) ? firstResponse.results.length : 0;

    if (!parsedParams.with_keywords || currentCount >= targetCount) {
      console.log(
        `[discover-natural] Request ${requestId} completed. Reason: ${
          !parsedParams.with_keywords ? 'no keywords' : 'full page'
        }. Results: ${currentCount}`,
      );
      return mergedResponse;
    }

    // Second pass: semantic expansion of keyword intent using Groq.
    const expandedKeywords = await this.nlService.expandKeywordsForRecall(
      dto.query,
      parsedParams.with_keywords,
      currentCount,
      targetCount,
    );

    if (expandedKeywords && expandedKeywords !== parsedParams.with_keywords) {
      console.log(`[discover-natural] Request ${requestId} Pass 2 (expanded) started`);
      const expandedParsedParams = {
        ...parsedParams,
        with_keywords: expandedKeywords,
      };
      const expandedDiscoverParams =
        await this.nlService.orchestrateDiscoverParameters(expandedParsedParams);
      const expandedResponse = await this.tvService.discover(expandedDiscoverParams);

      mergedResponse = this.mergeDiscoverResponses(mergedResponse, expandedResponse, targetCount);
      currentCount = mergedResponse.results.length;
      console.log(`[discover-natural] Request ${requestId} Pass 2 completed. Results: ${currentCount}`);
    }

    // Third pass: if still sparse and original expression used strict AND, relax to OR.
    if (currentCount < targetCount && parsedParams.with_keywords.includes(',')) {
      console.log(`[discover-natural] Request ${requestId} Pass 3 (relaxed OR) started`);
      const relaxedParsedParams = {
        ...parsedParams,
        with_keywords: parsedParams.with_keywords.replace(/,/g, '|'),
      };
      const relaxedDiscoverParams =
        await this.nlService.orchestrateDiscoverParameters(relaxedParsedParams);
      const relaxedResponse = await this.tvService.discover(relaxedDiscoverParams);

      mergedResponse = this.mergeDiscoverResponses(mergedResponse, relaxedResponse, targetCount);
      console.log(`[discover-natural] Request ${requestId} Pass 3 completed. Final results: ${mergedResponse.results.length}`);
    } else if (currentCount < targetCount) {
      console.log(
        `[discover-natural] Request ${requestId} completed. Pass 3 skipped (no AND operators). Final results: ${currentCount}`,
      );
    }

    console.log(`[discover-natural] Request ${requestId} finished successfully`);
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
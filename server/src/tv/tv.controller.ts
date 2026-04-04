import { Controller, Get, Post, Param, ParseIntPipe, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchTvDto } from './dto/search-tv.dto';
import { DiscoverTvDto } from './dto/discover-tv.dto';
import { NaturalLanguageSearchDto } from './dto/natural-language-search.dto';
import { TvService } from './tv.service';
import { NaturalLanguageOrchestrationService } from './natural-language-orchestration.service';
import { applyQualityFilter } from './quality-filter';

@Controller('tv')
@UseGuards(JwtAuthGuard)
export class TvController {
  constructor(
    private readonly tvService: TvService,
    private readonly nlService: NaturalLanguageOrchestrationService,
  ) {}

  @Get('search')
  search(@Query() dto: SearchTvDto) {
    return this.tvService.search(dto.query);
  }

  @Post('discover-natural')
  async discoverNatural(@Body() dto: NaturalLanguageSearchDto) {
    const targetCount = 20;
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const query = dto.query?.trim() || '';
    const defaultRegion = dto.watchRegion || 'US';
    const log = (msg: string, ...args: any[]) => console.log(`[discover-natural][${requestId}] ${msg}`, ...args);

    log('=== NEW REQUEST (Title-First) ===');
    log(`Query: "${query}", Default region: ${defaultRegion}`);

    const referenceNames = dto.referenceShows?.map(show => show.name) || [];

    // Allow the request if there's either a text query OR reference shows
    if (!query && referenceNames.length === 0) {
      return { page: 1, results: [], total_pages: 0, total_results: 0 };
    }

    // Step 1: Brainstorm titles via LLM
    log('Step 1: Brainstorming titles via LLM...');
    if (referenceNames.length > 0) {
      log(`Included Reference Shows: ${referenceNames.join(', ')}`);
    }
    const llmResponse = await this.nlService.parseWithLlm(query, referenceNames, defaultRegion);
    const { hard_filters, candidate_titles } = llmResponse as any;
    log(`LLM brainstormed ${candidate_titles?.length || 0} candidates.`);

    if (!candidate_titles || candidate_titles.length === 0) {
      return { page: 1, results: [], total_pages: 0, total_results: 0 };
    }

    // Step 2: Resolve hard filter IDs concurrently
    log('Step 2: Resolving provider and genre IDs concurrently...');
    let requiredProviderIds: number[] = [];
    let excludedGenreIds: number[] = [];

    const resolutionPromises: Promise<void>[] = [];

    if (hard_filters?.with_watch_providers) {
      const filtersWithRegion = { ...hard_filters, watch_region: hard_filters.watch_region || defaultRegion };
      resolutionPromises.push(
        this.nlService.resolveParsedParams(filtersWithRegion).then(discoverParams => {
          if (discoverParams.with_watch_providers) {
            requiredProviderIds = discoverParams.with_watch_providers.split('|').map(Number);
          }
        }),
      );
    }

    if (hard_filters?.without_genres?.length > 0) {
      resolutionPromises.push(
        this.nlService.resolveGenreIds(hard_filters.without_genres).then(ids => {
          excludedGenreIds = ids;
        }),
      );
    }

    // Await both resolutions simultaneously
    await Promise.all(resolutionPromises);

    // Pass the enriched hard_filters object
    const validationFilters = {
      ...hard_filters,
      watch_region: hard_filters?.watch_region || defaultRegion,
      requiredProviderIds,
      excludedGenreIds,
    };

    // Step 3: Map to TMDB Details and validate filters
    log('Step 3: Mapping to TMDB Details and running deep validation...');
    const finalShows = await this.nlService.resolveAndValidateTitles(
      candidate_titles,
      validationFilters,
    );

    log(`=== DONE === Total validated results: ${finalShows.length}`);

    // Filter out low-quality results
    const qualityShows = applyQualityFilter(finalShows);

    // Trim the payload to save bandwidth on the frontend
    const trimmedShows = qualityShows.slice(0, targetCount).map((show: any) => ({
      id: show.id,
      name: show.name,
      overview: show.overview,
      poster_path: show.poster_path,
      backdrop_path: show.backdrop_path,
      first_air_date: show.first_air_date,
      vote_average: show.vote_average,
      vote_count: show.vote_count,
      genre_ids: show.genres?.map((g: any) => g.id) || [],
      origin_country: show.origin_country,
      original_language: show.original_language,
      'watch/providers': show['watch/providers'],
    }));

    return {
      page: 1,
      results: trimmedShows,
      total_pages: 1,
      total_results: qualityShows.length,
    };
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
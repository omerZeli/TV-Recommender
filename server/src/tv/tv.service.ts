import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applyQualityFilter } from './quality-filter';

@Injectable()
export class TvService {
  constructor(private readonly configService: ConfigService) {}

  private getTmdbBearerToken(): string {
    const tmdbBearerToken = this.configService.get<string>('TMDB_BEARER_TOKEN');

    if (!tmdbBearerToken) {
      throw new InternalServerErrorException('TMDB credentials are not configured');
    }

    return tmdbBearerToken;
  }

  async search(query: string) {
    const tmdbBearerToken = this.getTmdbBearerToken();

    const searchParams = new URLSearchParams({
      query,
      include_adult: 'true',
      language: 'en-US',
      page: '1',
    });

    const response = await fetch(
      `https://api.themoviedb.org/3/search/tv?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${tmdbBearerToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new BadGatewayException('TMDB search failed');
    }

    const data = await response.json();
    data.results = applyQualityFilter(data.results ?? []);
    return data;
  }

  async getDetails(id: number) {
    const tmdbBearerToken = this.getTmdbBearerToken();

    const searchParams = new URLSearchParams({
      language: 'en-US',
      append_to_response: 'videos,keywords,aggregate_credits,watch/providers',
    });

    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${id}?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${tmdbBearerToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new BadGatewayException('TMDB details fetch failed');
    }

    return response.json();
  }
  async getKeywords(id: number) {
    const tmdbBearerToken = this.getTmdbBearerToken();

    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${id}/keywords`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${tmdbBearerToken}`,
        },
      },
    );

    if (!response.ok) {
      return { results: [] };
    }

    return response.json();
  }

  async getVideos(id: number) {
    const tmdbBearerToken = this.getTmdbBearerToken();

    const searchParams = new URLSearchParams({
      language: 'en-US',
    });

    const response = await fetch(
      `https://api.themoviedb.org/3/tv/${id}/videos?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${tmdbBearerToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new BadGatewayException('TMDB videos fetch failed');
    }

    return response.json();
  }

  async getWatchProviders() {
    const tmdbBearerToken = this.getTmdbBearerToken();

    const searchParams = new URLSearchParams({
      language: 'en-US',
      watch_region: 'US',
    });

    const response = await fetch(
      `https://api.themoviedb.org/3/watch/providers/tv?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${tmdbBearerToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new BadGatewayException('TMDB watch providers fetch failed');
    }

    const data = await response.json();
    return data.results || [];
  }

  async getProductionCompanies() {
    const tmdbBearerToken = this.getTmdbBearerToken();

    try {
      const searchParams = new URLSearchParams({
        page: '1',
        sort_by: 'popularity.desc',
      });

      const response = await fetch(
        `https://api.themoviedb.org/3/tv/popular?${searchParams.toString()}`,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${tmdbBearerToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new BadGatewayException('TMDB popular TV fetch failed');
      }

      const data = await response.json();
      const allCompanies = new Map<
        number,
        {
          id: number;
          name: string;
          logo_path: string | null;
        }
      >();

      // Extract companies from popular shows
      for (const show of data.results || []) {
        const detailsParams = new URLSearchParams({
          language: 'en-US',
        });

        const detailsResponse = await fetch(
          `https://api.themoviedb.org/3/tv/${show.id}?${detailsParams.toString()}`,
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
              Authorization: `Bearer ${tmdbBearerToken}`,
            },
          },
        );

        if (detailsResponse.ok) {
          const showDetails = await detailsResponse.json();
          if (showDetails.networks && Array.isArray(showDetails.networks)) {
            for (const network of showDetails.networks) {
              allCompanies.set(network.id, {
                id: network.id,
                name: network.name,
                logo_path: network.logo_path,
              });
            }
          }
        }
      }

      return Array.from(allCompanies.values()).slice(0, 20);
    } catch (error) {
      throw new BadGatewayException('Failed to fetch production companies');
    }
  }

  async discover(discoverParams: Record<string, any>) {
    const tmdbBearerToken = this.getTmdbBearerToken();

    const searchParams = new URLSearchParams();

    const discoverKeyMap: Record<string, string> = {
      air_date_gte: 'air_date.gte',
      air_date_lte: 'air_date.lte',
      first_air_date_gte: 'first_air_date.gte',
      first_air_date_lte: 'first_air_date.lte',
      vote_average_gte: 'vote_average.gte',
      vote_average_lte: 'vote_average.lte',
      vote_count_gte: 'vote_count.gte',
      vote_count_lte: 'vote_count.lte',
      with_runtime_gte: 'with_runtime.gte',
      with_runtime_lte: 'with_runtime.lte',
    };

    // Translate internal query keys to TMDB discover keys.
    for (const [key, value] of Object.entries(discoverParams)) {
      if (value !== undefined && value !== null && value !== '') {
        const mappedKey = discoverKeyMap[key] ?? key;
        searchParams.append(mappedKey, String(value));
      }
    }

    // TMDB requires watch_region when filtering by watch providers.
    if (searchParams.has('with_watch_providers') && !searchParams.has('watch_region')) {
      searchParams.append('watch_region', 'US');
    }

    // Ensure required defaults
    if (!searchParams.has('vote_average.gte')) {
      searchParams.append('vote_average.gte', '5');
    }
    if (!searchParams.has('vote_count.gte')) {
      // Use a lower threshold for non-English / regional content to avoid
      // filtering out most shows that simply have fewer international votes.
      const isRegionalQuery =
        (searchParams.has('with_origin_country') &&
          searchParams.get('with_origin_country')?.toUpperCase() !== 'US') ||
        (searchParams.has('with_original_language') &&
          searchParams.get('with_original_language') !== 'en');
      searchParams.append('vote_count.gte', isRegionalQuery ? '10' : '30');
    }
    if (!searchParams.has('include_adult')) {
      searchParams.append('include_adult', 'false');
    }
    // Do not default language — let TMDB use its own default or respect the LLM-provided value
    if (!searchParams.has('page')) {
      searchParams.append('page', '1');
    }
    if (!searchParams.has('sort_by')) {
      searchParams.append('sort_by', 'popularity.desc');
    }

    const hasWatchProviders = searchParams.has('with_watch_providers');
    const watchRegionRaw = searchParams.get('watch_region') ?? '';
    const watchRegions = Array.from(
      new Set(
        watchRegionRaw
          .split(/[|,]/)
          .map((region) => region.trim().toUpperCase())
          .filter((region) => /^[A-Z]{2}$/.test(region)),
      ),
    );

    const requestId = searchParams.get('_request_id');
    const logPrefix = requestId ? `[TMDB discover ${requestId}]` : '[TMDB discover]';
    console.log(logPrefix + ' Final params JSON:', Object.fromEntries(searchParams.entries()));
    console.log(logPrefix + ' Query string:', searchParams.toString());

    if (hasWatchProviders && watchRegions.length > 1) {
      const mergedResults = new Map<number, any>();
      let maxTotalPages = 0;

      for (const region of watchRegions) {
        const regionParams = new URLSearchParams(searchParams);
        regionParams.set('watch_region', region);

        console.log(
          `[TMDB discover] Region-specific params (${region}):`,
          Object.fromEntries(regionParams.entries()),
        );

        const regionResponse = await fetch(
          `https://api.themoviedb.org/3/discover/tv?${regionParams.toString()}`,
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
              Authorization: `Bearer ${tmdbBearerToken}`,
            },
          },
        );

        if (!regionResponse.ok) {
          continue;
        }

        const regionData = await regionResponse.json();
        maxTotalPages = Math.max(maxTotalPages, Number(regionData.total_pages ?? 0));

        for (const show of regionData.results ?? []) {
          mergedResults.set(show.id, show);
        }
      }

      if (mergedResults.size === 0) {
        throw new BadGatewayException('TMDB discover failed');
      }

      const mergedList = Array.from(mergedResults.values()).sort(
        (a, b) => Number(b.popularity ?? 0) - Number(a.popularity ?? 0),
      );

      return {
        page: Number(searchParams.get('page') ?? 1),
        results: mergedList,
        total_pages: maxTotalPages || 1,
        total_results: mergedList.length,
      };
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/discover/tv?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${tmdbBearerToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new BadGatewayException('TMDB discover failed');
    }

    return response.json();
  }
}
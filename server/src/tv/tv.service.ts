import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

    return response.json();
  }

  async getDetails(id: number) {
    const tmdbBearerToken = this.getTmdbBearerToken();

    const searchParams = new URLSearchParams({
      language: 'en-US',
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
}
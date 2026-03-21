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
}
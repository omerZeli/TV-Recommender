import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddWatchlistItemDto } from './dto/add-watchlist-item.dto';
import { WatchlistItem } from './watchlist-item.entity';

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(WatchlistItem)
    private readonly watchlistRepo: Repository<WatchlistItem>,
  ) {}

  async getForUser(userId: number): Promise<WatchlistItem[]> {
    return this.watchlistRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async addForUser(userId: number, dto: AddWatchlistItemDto): Promise<WatchlistItem> {
    const existing = await this.watchlistRepo.findOne({
      where: { userId, showId: dto.id },
    });

    if (existing) {
      return existing;
    }

    const item = this.watchlistRepo.create({
      userId,
      showId: dto.id,
      name: dto.name,
      overview: dto.overview ?? '',
      posterPath: dto.poster_path ?? null,
      backdropPath: dto.backdrop_path ?? null,
      firstAirDate: dto.first_air_date ?? '',
      voteAverage: dto.vote_average ?? 0,
      voteCount: dto.vote_count ?? 0,
      originalName: dto.original_name ?? dto.name,
      originalLanguage: dto.original_language ?? '',
      originCountry: dto.origin_country ?? [],
    });

    return this.watchlistRepo.save(item);
  }

  async removeForUser(userId: number, showId: number): Promise<boolean> {
    const result = await this.watchlistRepo.delete({ userId, showId });
    return (result.affected ?? 0) > 0;
  }
}

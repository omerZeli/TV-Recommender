import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddWatchlistItemDto } from './dto/add-watchlist-item.dto';
import { WatchlistService } from './watchlist.service';

@Controller('watchlist')
@UseGuards(JwtAuthGuard)
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  async list(@Request() req) {
    const items = await this.watchlistService.getForUser(req.user.id);

    return items.map((item) => ({
      id: item.showId,
      name: item.name,
      overview: item.overview,
      poster_path: item.posterPath,
      backdrop_path: item.backdropPath,
      first_air_date: item.firstAirDate,
      vote_average: item.voteAverage,
      vote_count: item.voteCount,
      original_name: item.originalName,
      original_language: item.originalLanguage,
      origin_country: item.originCountry,
    }));
  }

  @Post()
  async add(@Request() req, @Body() dto: AddWatchlistItemDto) {
    const item = await this.watchlistService.addForUser(req.user.id, dto);

    return {
      id: item.showId,
      name: item.name,
      overview: item.overview,
      poster_path: item.posterPath,
      backdrop_path: item.backdropPath,
      first_air_date: item.firstAirDate,
      vote_average: item.voteAverage,
      vote_count: item.voteCount,
      original_name: item.originalName,
      original_language: item.originalLanguage,
      origin_country: item.originCountry,
    };
  }

  @Delete(':showId')
  async remove(
    @Request() req,
    @Param('showId', ParseIntPipe) showId: number,
  ) {
    const removed = await this.watchlistService.removeForUser(req.user.id, showId);
    return { removed };
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddWatchlistItemDto } from './dto/add-watchlist-item.dto';
import { SetWatchStatusDto } from './dto/set-watch-status.dto';
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
      watched: item.watched,
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
      watched: item.watched,
    };
  }

  @Patch(':showId/watched')
  async setWatched(
    @Request() req,
    @Param('showId', ParseIntPipe) showId: number,
    @Body() dto: SetWatchStatusDto,
  ) {
    const item = await this.watchlistService.setWatchedForUser(
      req.user.id,
      showId,
      dto.watched,
      dto.show,
    );

    if (!item) {
      return { updated: false };
    }

    return {
      updated: true,
      id: item.showId,
      watched: item.watched,
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

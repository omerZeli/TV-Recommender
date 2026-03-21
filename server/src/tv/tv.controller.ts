import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchTvDto } from './dto/search-tv.dto';
import { TvService } from './tv.service';

@Controller('tv')
@UseGuards(JwtAuthGuard)
export class TvController {
  constructor(private readonly tvService: TvService) {}

  @Get('search')
  search(@Query() dto: SearchTvDto) {
    return this.tvService.search(dto.query);
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
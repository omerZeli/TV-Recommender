import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
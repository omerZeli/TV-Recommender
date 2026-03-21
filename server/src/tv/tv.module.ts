import { Module } from '@nestjs/common';
import { TvController } from './tv.controller';
import { TvService } from './tv.service';

@Module({
  controllers: [TvController],
  providers: [TvService],
})
export class TvModule {}
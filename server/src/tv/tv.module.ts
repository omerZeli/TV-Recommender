import { Module } from '@nestjs/common';
import { TvController } from './tv.controller';
import { TvService } from './tv.service';
import { NaturalLanguageOrchestrationService } from './natural-language-orchestration.service';

@Module({
  controllers: [TvController],
  providers: [TvService, NaturalLanguageOrchestrationService],
})
export class TvModule {}
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddWatchlistItemDto } from './add-watchlist-item.dto';

export class SetWatchStatusDto {
  @IsBoolean()
  watched: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddWatchlistItemDto)
  show?: AddWatchlistItemDto;
}

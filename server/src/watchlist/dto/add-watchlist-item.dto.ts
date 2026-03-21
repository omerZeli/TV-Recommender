import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AddWatchlistItemDto {
  @IsInt()
  @Min(1)
  id: number;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  poster_path?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  backdrop_path?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  first_air_date?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vote_average?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vote_count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  original_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  original_language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  origin_country?: string[];
}

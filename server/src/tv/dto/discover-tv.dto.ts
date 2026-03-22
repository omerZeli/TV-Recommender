import { IsOptional, IsString } from 'class-validator';

export class DiscoverTvDto {
  @IsOptional()
  @IsString()
  air_date_gte?: string;

  @IsOptional()
  @IsString()
  air_date_lte?: string;

  @IsOptional()
  @IsString()
  first_air_date_year?: string;

  @IsOptional()
  @IsString()
  vote_average_gte?: string;

  @IsOptional()
  @IsString()
  vote_average_lte?: string;

  @IsOptional()
  @IsString()
  with_runtime_gte?: string;

  @IsOptional()
  @IsString()
  with_runtime_lte?: string;

  @IsOptional()
  @IsString()
  with_genres?: string;

  @IsOptional()
  @IsString()
  with_original_language?: string;

  @IsOptional()
  @IsString()
  with_origin_country?: string;

  @IsOptional()
  @IsString()
  with_status?: string;

  @IsOptional()
  @IsString()
  with_type?: string;

  @IsOptional()
  @IsString()
  with_watch_providers?: string;

  @IsOptional()
  @IsString()
  with_companies?: string;

  @IsOptional()
  @IsString()
  watch_region?: string;

  @IsOptional()
  @IsString()
  with_watch_monetization_types?: string;

  @IsOptional()
  @IsString()
  sort_by?: string;

  @IsOptional()
  @IsString()
  page?: string;
}

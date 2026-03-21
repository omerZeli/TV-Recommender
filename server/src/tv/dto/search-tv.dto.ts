import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SearchTvDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query: string;
}
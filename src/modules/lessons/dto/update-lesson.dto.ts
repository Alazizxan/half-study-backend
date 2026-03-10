import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsInt()
  estimatedMin?: number;
}

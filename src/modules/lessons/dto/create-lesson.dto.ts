import { IsString, IsUUID, IsInt, Min, IsOptional } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsInt()
  @Min(1)
  order: number;

  @IsOptional()
  @IsInt()
  estimatedMin?: number;

  @IsUUID()
  courseId: string;
}

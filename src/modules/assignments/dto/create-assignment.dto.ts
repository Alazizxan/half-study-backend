import { IsString, IsUUID, IsInt, Min } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsInt()
  @Min(1)
  maxScore: number;

  @IsUUID()
  lessonId: string;
}
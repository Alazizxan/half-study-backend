// ─── assignments/dto/create-assignment.dto.ts ────────────────────────────────
import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
  Max,
  MinLength,
  ArrayMaxSize,
} from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  lessonId: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(10)
  description: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  maxScore?: number = 100;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean = false;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @IsOptional()
  allowedFileTypes?: string[] = ['jpg', 'jpeg', 'png', 'pdf', 'txt', 'zip'];

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxFileSizeMb?: number = 10;
}

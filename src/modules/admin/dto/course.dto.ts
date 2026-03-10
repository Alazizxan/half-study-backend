// src/modules/admin/dto/course.dto.ts

import {
  IsString, IsEnum, IsOptional, IsBoolean,
  IsNumber, IsInt, Min, MaxLength, IsArray,
} from 'class-validator';
import { Difficulty, PriceType } from '@prisma/client';

export class CreateCourseDto {
  @IsString()
  title: string;

  @IsString()
  slug: string;

  @IsString()
  description: string;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsEnum(PriceType)
  @IsOptional()
  priceType?: PriceType = PriceType.FREE;

  @IsInt() @Min(0) @IsOptional()
  coinPrice?: number;

  @IsNumber() @IsOptional()
  moneyPrice?: number;

  @IsString() @IsOptional()
  categoryId?: string;

  @IsBoolean() @IsOptional()
  hasCertificate?: boolean = false;
}

export class UpdateCourseDto {
  @IsString() @IsOptional()
  title?: string;

  @IsString() @IsOptional()
  slug?: string;

  @IsString() @IsOptional()
  description?: string;

  @IsEnum(Difficulty) @IsOptional()
  difficulty?: Difficulty;

  @IsEnum(PriceType) @IsOptional()
  priceType?: PriceType;

  @IsInt() @Min(0) @IsOptional()
  coinPrice?: number;

  @IsNumber() @IsOptional()
  moneyPrice?: number;

  @IsString() @IsOptional()
  categoryId?: string;

  @IsBoolean() @IsOptional()
  hasCertificate?: boolean;

  @IsBoolean() @IsOptional()
  isPublished?: boolean;
}

// src/modules/admin/dto/lesson.dto.ts

export class CreateLessonDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsInt() @Min(0)
  order: number;

  @IsString()
  courseId: string;

  @IsInt() @Min(1) @IsOptional()
  estimatedMin?: number;

  @IsBoolean() @IsOptional()
  isPublished?: boolean = false;
}

export class UpdateLessonDto {
  @IsString() @IsOptional()
  title?: string;

  @IsString() @IsOptional()
  content?: string;

  @IsInt() @Min(0) @IsOptional()
  order?: number;

  @IsInt() @Min(1) @IsOptional()
  estimatedMin?: number;

  @IsBoolean() @IsOptional()
  isPublished?: boolean;
}

export class ReorderLessonsDto {
  @IsArray()
  // [{ id: string, order: number }]
  items: { id: string; order: number }[];
}

// src/modules/admin/dto/category.dto.ts

export class CreateCategoryDto {
  @IsString() @MaxLength(80)
  name: string;

  @IsString() @MaxLength(80)
  slug: string;
}
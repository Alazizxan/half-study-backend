import { IsEnum, IsOptional, IsString, IsUUID, IsNumber } from 'class-validator';
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
  priceType: PriceType;

  @IsOptional()
  @IsNumber()
  coinPrice?: number;

  @IsOptional()
  @IsNumber()
  moneyPrice?: number;

  @IsUUID()
  categoryId: string;
}
// ─── create-quiz.dto.ts ───────────────────────────────────────────────────────
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
  IsArray,
  IsEnum,
  IsUrl,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';

export class CreateOptionDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsBoolean()
  @IsOptional()
  isCorrect?: boolean = false;

  @IsInt()
  @IsOptional()
  order?: number = 0;
}

export class CreateQuestionDto {
  @IsEnum(QuestionType)
  type: QuestionType;

  @IsString()
  @MinLength(1)
  text: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  points?: number = 10;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number = 0;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];

  // FLAG type — plain text, hashed in service
  @IsOptional()
  @IsString()
  flagAnswer?: string;

  // TEXT / FILE_UPLOAD — manual grading guide
  @IsOptional()
  @IsString()
  rubric?: string;
}

export class CreateQuizDto {
  @IsString()
  lessonId: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  passingScore?: number = 60;

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean = false;

  @IsInt()
  @Min(1)
  @IsOptional()
  timeLimit?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxAttempts?: number = 3;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean = true;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}

// ─── update-quiz.dto.ts ───────────────────────────────────────────────────────
import { PartialType } from '@nestjs/mapped-types';

export class UpdateQuizDto extends PartialType(CreateQuizDto) {}

// ─── submit-quiz.dto.ts ───────────────────────────────────────────────────────

export class AnswerDto {
  @IsString()
  questionId: string;

  // MULTIPLE_CHOICE / TRUE_FALSE
  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  // FLAG / TEXT
  @IsOptional()
  @IsString()
  textAnswer?: string;

  // FILE_UPLOAD (fileKey returned from /upload endpoint)
  @IsOptional()
  @IsString()
  fileKey?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;
}

export class SubmitQuizDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

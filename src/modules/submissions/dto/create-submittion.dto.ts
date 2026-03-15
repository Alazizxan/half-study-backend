// ─── submissions/dto/create-submission.dto.ts ────────────────────────────────
import { SubmissionStatus } from '@prisma/client';
import { IsString, IsOptional, Max, Min, IsInt, IsEnum } from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  assignmentId: string;

  @IsOptional()
  @IsString()
  textAnswer?: string;

  // Returned from POST /api/v1/upload/presign then uploaded to S3
  @IsOptional()
  @IsString()
  fileKey?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  fileSize?: number;
}

export class ReviewSubmissionDto {
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;
 
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  score?: number;
 
  @IsOptional()
  @IsString()
  feedback?: string;
}

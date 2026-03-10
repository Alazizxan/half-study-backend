// ─── submissions/dto/create-submission.dto.ts ────────────────────────────────
import { IsString, IsOptional } from 'class-validator';

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
  status: import('@prisma/client').SubmissionStatus;
  score?: number;
  feedback?: string;
}

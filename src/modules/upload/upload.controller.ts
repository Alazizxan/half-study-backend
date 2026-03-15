import {
  Controller, Post, Get, Body, Param,
  UseGuards, Res, Req,
} from '@nestjs/common';
import { IsString, IsInt, IsIn, Min, Max, IsOptional } from 'class-validator';
import express from 'express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class PresignDto {
  @IsString()
  fileName: string;
  @IsString()
  contentType: string;
  @IsInt() @Min(1) @Max(20 * 1024 * 1024)
  sizeBytes: number;
  @IsIn(['submissions', 'quiz-answers', 'avatars', 'receipts'])
  folder: 'submissions' | 'quiz-answers' | 'avatars' | 'receipts';
  @IsOptional()
  @IsIn(['image', 'document', 'archive', 'any'])
  allowedCategory?: 'image' | 'document' | 'archive' | 'any';
}

class SignedUrlDto {
  @IsString() filename: string;
  @IsString() mimeType: string;
}

@Controller('api/v1/upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private upload: UploadService) {}

  // ── Eski endpoint — o'zgarmaydi ──────────────────────────────────────────
  @Post('signed-url')
  generate(@CurrentUser() user: any, @Body() body: SignedUrlDto) {
    return this.upload.generateUploadUrl(user.sub, body.filename, body.mimeType);
  }

  // ── Yangi presign endpoint ────────────────────────────────────────────────
  @Post('presign')
  getPresignedUrl(@CurrentUser() user: any, @Body() dto: PresignDto) {
    return this.upload.getPresignedUploadUrl({
      folder:          dto.folder,
      fileName:        dto.fileName,
      contentType:     dto.contentType,
      sizeBytes:       dto.sizeBytes,
      allowedCategory: dto.allowedCategory ?? 'any',
      userId:          user.sub,
    });
  }

  // ── Fayl olish — S3/MinIO presigned URL ga redirect ──────────────────────
  // GET /api/v1/upload/file/submissions/userId/uuid.png
  // NestJS wildcard: @Param('0') ishlamasligi mumkin, shuning uchun @Req ishlatamiz
  @Get('file/*')
  async getFile(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      // req.path: "/api/v1/upload/file/submissions/userId/uuid.png"
      // file/ dan keyingi qismni olish
      const fullPath = req.path; // e.g. "/api/v1/upload/file/submissions/..."
      const marker   = '/file/';
      const idx      = fullPath.indexOf(marker);
      const key      = idx !== -1 ? fullPath.slice(idx + marker.length) : '';

      if (!key) {
        return res.status(400).json({ message: 'Invalid file key' });
      }

      const signedUrl = await this.upload.getSignedDownloadUrl(key, 3600);
      return res.redirect(302, signedUrl);
    } catch (err: any) {
      return res.status(500).json({ message: err.message ?? 'File access failed' });
    }
  }
}
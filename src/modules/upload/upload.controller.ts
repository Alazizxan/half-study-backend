import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsInt, IsIn, Min, Max, IsOptional } from 'class-validator';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class PresignDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  sizeBytes: number;

  @IsIn(['submissions', 'quiz-answers', 'avatars', 'receipts'])
  folder: 'submissions' | 'quiz-answers' | 'avatars' | 'receipts';

  @IsOptional()
  @IsIn(['image', 'document', 'archive', 'any'])
  allowedCategory?: 'image' | 'document' | 'archive' | 'any';
}

class SignedUrlDto {
  @IsString()
  filename: string;

  @IsString()
  mimeType: string;
}

@Controller('api/v1/upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private upload: UploadService) {}

  // ✅ ESKI ENDPOINT — o'zgarmaydi
  @Post('signed-url')
  generate(@CurrentUser() user: any, @Body() body: SignedUrlDto) {
    return this.upload.generateUploadUrl(
      user.sub,
      body.filename,
      body.mimeType,
    );
  }

  // ✅ YANGI ENDPOINT — qo'shimcha
  @Post('presign')
  getPresignedUrl(@CurrentUser() user: any, @Body() dto: PresignDto) {
    return this.upload.getPresignedUploadUrl({
      folder: dto.folder,
      fileName: dto.fileName,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      allowedCategory: dto.allowedCategory ?? 'any',
      userId: user.sub,
    });
  }
}

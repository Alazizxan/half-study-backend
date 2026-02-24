import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private upload: UploadService) {}

  @Post('signed-url')
  generate(
    @CurrentUser() user: any,
    @Body()
    body: { filename: string; mimeType: string },
  ) {
    return this.upload.generateUploadUrl(
      user.sub,
      body.filename,
      body.mimeType,
    );
  }
}
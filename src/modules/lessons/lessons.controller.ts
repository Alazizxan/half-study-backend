import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

import { LessonsService } from './lessons.service';
import { LessonUnlockService } from './lesson-unlock.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

const PENDING_DIR = process.env.VIDEO_PENDING_DIR ?? '/var/www/uploads/pending';
if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });

const videoStorage = diskStorage({
  destination: (_req, _file, cb) => cb(null, PENDING_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    const name = `vid-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const videoFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const ok = [
    'video/mp4',
    'video/x-matroska',
    'video/webm',
    'video/quicktime',
    'video/avi',
  ];
  ok.includes(file.mimetype)
    ? cb(null, true)
    : cb(
      new BadRequestException(
        'Only video files allowed (mp4, mkv, webm, mov, avi)',
      ),
      false,
    );
};

@Controller('api/v1/lessons')
@UseGuards(JwtAuthGuard)
export class LessonsController {
  constructor(
    private lessons: LessonsService,
    private unlock: LessonUnlockService,
  ) { }

  // ── ADMIN ──────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.lessons.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.lessons.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessons.delete(user, id);
  }

  @Patch(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  publish(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessons.publish(user, id);
  }

  @Post(':id/video')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: videoStorage,
      fileFilter: videoFilter,
      limits: { fileSize: 10 * 1024 * 1024 * 1024 },
    }),
  )
  uploadVideo(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.lessons.uploadVideo(user, id, file);
  }

  @Get(':id/video-status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getVideoStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.lessons.getVideoStatus(user, id);
  }

  // ── STUDENT ────────────────────────────────────────────────────────────────

  // Muhim: /course/:courseId/list ni :id dan OLDIN yozing — yo'qsa NestJS
  // "course" ni lessonId deb o'qib oladi
  @Get('course/:courseId/list')
  getLessonList(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    return this.unlock.getLessonsWithUnlockStatus(user.sub, courseId);
  }

  @Get(':id')
  getLesson(@Param('id') id: string, @CurrentUser() user: any) {
    return this.lessons.getLessonDetail(id, user.sub);
  }

  @Get(':id/stream')
  streamLesson(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res({ passthrough: false }) res: Response,
  ) {
    return this.lessons.streamLesson(id, user.sub, res);
  }

  @Get(':id/stream/:filename')
  streamSegment(
    @Param('id') id: string,
    @Param('filename') filename: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    return this.lessons.streamSegment(id, filename, user.sub, res);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.lessons.markComplete(id, user.sub);
  }
}

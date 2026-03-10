// src/modules/admin/admin-content.controller.ts
//
// Barcha admin content endpointlari shu yerda:
//  /api/v1/admin/categories  — category CRUD
//  /api/v1/admin/courses     — course CRUD + cover upload + publish
//  /api/v1/admin/lessons     — lesson CRUD + video upload + reorder

import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards,
  UseInterceptors, UploadedFile,
  BadRequestException, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage }     from 'multer';
import * as path           from 'path';
import * as fs             from 'fs';

import { AdminContentService } from './admin.content.service';
import { JwtAuthGuard }        from '../../common/guards/jwt-auth.guard';
import { RolesGuard }          from '../../common/guards/roles.guard';
import { Roles }               from '../../common/decorators/roles.decorator';
import { Role }                from '@prisma/client';

// ── Storage configs ──────────────────────────────────────────────────────────

const COVER_DIR   = process.env.COVER_UPLOAD_DIR  ?? path.join(process.cwd(), 'uploads', 'covers');
const PENDING_DIR = process.env.VIDEO_PENDING_DIR ?? path.join(process.cwd(), 'uploads', 'pending');

[COVER_DIR, PENDING_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const coverStorage = diskStorage({
  destination: (_req, _file, cb) => cb(null, COVER_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `cover-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const videoStorage = diskStorage({
  destination: (_req, _file, cb) => cb(null, PENDING_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.mp4';
    const name = `vid-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const imageFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ? cb(null, true)
    : cb(new BadRequestException('Only JPG/PNG/WEBP allowed'), false);
};

const videoFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  ['video/mp4', 'video/x-matroska', 'video/webm', 'video/quicktime', 'video/avi']
    .includes(file.mimetype)
    ? cb(null, true)
    : cb(new BadRequestException('Only video files allowed (mp4, mkv, webm, mov, avi)'), false);
};

// ─────────────────────────────────────────────────────────────────────────────

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminContentController {
  constructor(private content: AdminContentService) {}

  // ══════════════════════════════════════════════════════
  //  CATEGORIES
  // ══════════════════════════════════════════════════════

  /** GET /admin/categories */
  @Get('categories')
  listCategories() {
    return this.content.listCategories();
  }

  /** POST /admin/categories */
  @Post('categories')
  createCategory(@Body() dto: { name: string; slug: string }) {
    return this.content.createCategory(dto);
  }

  /** PATCH /admin/categories/:id */
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: { name?: string; slug?: string },
  ) {
    return this.content.updateCategory(id, dto);
  }

  /** DELETE /admin/categories/:id */
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.content.deleteCategory(id);
  }

  // ══════════════════════════════════════════════════════
  //  COURSES
  // ══════════════════════════════════════════════════════

  /**
   * GET /admin/courses?page=1&pageSize=20&search=
   */
  @Get('courses')
  listCourses(
    @Query('page',     new DefaultValuePipe(1),  ParseIntPipe) page:     number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    return this.content.listCourses(page, pageSize, search);
  }

  /** GET /admin/courses/:id */
  @Get('courses/:id')
  getCourse(@Param('id') id: string) {
    return this.content.getCourse(id);
  }

  /** POST /admin/courses */
  @Post('courses')
  createCourse(@Body() dto: any) {
    return this.content.createCourse(dto);
  }

  /** PATCH /admin/courses/:id */
  @Patch('courses/:id')
  updateCourse(@Param('id') id: string, @Body() dto: any) {
    return this.content.updateCourse(id, dto);
  }

  /** PATCH /admin/courses/:id/publish */
  @Patch('courses/:id/publish')
  publishCourse(@Param('id') id: string) {
    return this.content.publishCourse(id);
  }

  /** PATCH /admin/courses/:id/unpublish */
  @Patch('courses/:id/unpublish')
  unpublishCourse(@Param('id') id: string) {
    return this.content.unpublishCourse(id);
  }

  /**
   * DELETE /admin/courses/:id?force=true
   * force=true → enrolled o'quvchilar bilan ham o'chiradi
   */
  @Delete('courses/:id')
  deleteCourse(
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    return this.content.deleteCourse(id, force === 'true');
  }

  /**
   * POST /admin/courses/:id/cover
   * multipart/form-data  field: "file"
   */
  @Post('courses/:id/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage:    coverStorage,
      fileFilter: imageFilter,
      limits:     { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  uploadCover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.content.uploadCourseCover(id, file);
  }

  // ══════════════════════════════════════════════════════
  //  LESSONS
  // ══════════════════════════════════════════════════════

  /** GET /admin/lessons?courseId=xxx */
  @Get('lessons')
  listLessons(@Query('courseId') courseId: string) {
    if (!courseId) throw new BadRequestException('courseId required');
    return this.content.listLessons(courseId);
  }

  /** GET /admin/lessons/:id */
  @Get('lessons/:id')
  getLesson(@Param('id') id: string) {
    return this.content.getLesson(id);
  }

  /** POST /admin/lessons */
  @Post('lessons')
  createLesson(@Body() dto: any) {
    return this.content.createLesson(dto);
  }

  /** PATCH /admin/lessons/:id */
  @Patch('lessons/:id')
  updateLesson(@Param('id') id: string, @Body() dto: any) {
    return this.content.updateLesson(id, dto);
  }

  /** PATCH /admin/lessons/:id/publish */
  @Patch('lessons/:id/publish')
  publishLesson(@Param('id') id: string) {
    return this.content.publishLesson(id);
  }

  /** PATCH /admin/lessons/:id/unpublish */
  @Patch('lessons/:id/unpublish')
  unpublishLesson(@Param('id') id: string) {
    return this.content.unpublishLesson(id);
  }

  /** DELETE /admin/lessons/:id */
  @Delete('lessons/:id')
  deleteLesson(@Param('id') id: string) {
    return this.content.deleteLesson(id);
  }

  /**
   * PATCH /admin/lessons/reorder
   * body: { courseId: string, items: [{id, order}] }
   */
  @Patch('lessons/reorder')
  reorderLessons(@Body() dto: { courseId: string; items: { id: string; order: number }[] }) {
    return this.content.reorderLessons(dto.courseId, dto.items);
  }

  // ── VIDEO ──────────────────────────────────────────────────────────────────

  /**
   * POST /admin/lessons/:id/video
   * multipart/form-data  field: "file"
   * Max: 10 GB
   */
  @Post('lessons/:id/video')
  @UseInterceptors(
    FileInterceptor('file', {
      storage:    videoStorage,
      fileFilter: videoFilter,
      limits:     { fileSize: 10 * 1024 * 1024 * 1024 },
    }),
  )
  uploadVideo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.content.uploadLessonVideo(id, file);
  }

  /** GET /admin/lessons/:id/video-status */
  @Get('lessons/:id/video-status')
  videoStatus(@Param('id') id: string) {
    return this.content.getVideoStatus(id);
  }

  /** DELETE /admin/lessons/:id/video */
  @Delete('lessons/:id/video')
  deleteVideo(@Param('id') id: string) {
    return this.content.deleteVideo(id);
  }
}
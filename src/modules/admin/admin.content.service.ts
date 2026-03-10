// src/modules/admin/admin-content.service.ts
//
// Course, Lesson, Category — CRUD + cover/video upload
// Mavjud AdminService bilan bir modulda yashaydi.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue }    from '@nestjs/bull';
import type { Queue }     from 'bull';
import { Difficulty, PriceType } from '@prisma/client';
import * as fs   from 'fs';
import * as path from 'path';

const VIDEO_DIR = () =>
  process.env.VIDEO_OUTPUT_DIR ?? path.join(process.cwd(), 'uploads', 'videos');

const COVER_DIR = () =>
  process.env.COVER_UPLOAD_DIR ?? path.join(process.cwd(), 'uploads', 'covers');

@Injectable()
export class AdminContentService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('video') private videoQueue: Queue,
  ) {}

  // ═══════════════════════════════════════════════════════
  //  CATEGORIES
  // ═══════════════════════════════════════════════════════

  async listCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
  }

  async createCategory(dto: { name: string; slug: string }) {
    const exists = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) throw new ConflictException('Slug already exists');

    return this.prisma.category.create({ data: dto });
  }

  async updateCategory(id: string, dto: { name?: string; slug?: string }) {
    await this._findCategoryOrThrow(id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    await this._findCategoryOrThrow(id);
    const linked = await this.prisma.course.count({ where: { categoryId: id } });
    if (linked > 0)
      throw new BadRequestException(`Cannot delete: ${linked} course(s) use this category`);
    return this.prisma.category.delete({ where: { id } });
  }

  // ═══════════════════════════════════════════════════════
  //  COURSES
  // ═══════════════════════════════════════════════════════

  async listCourses(page = 1, pageSize = 20, search?: string) {
    const where = search
      ? { title: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        skip:  (page - 1) * pageSize,
        take:  pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          _count: { select: { lessons: true, enrollments: true } },
        },
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      items: courses.map((c) => ({
        id:           c.id,
        title:        c.title,
        slug:         c.slug,
        difficulty:   c.difficulty,
        priceType:    c.priceType,
        coinPrice:    c.coinPrice,
        isPublished:  c.isPublished,
        hasCertificate: c.hasCertificate,
        coverImage:   c.coverImage,
        category:     c.category,
        lessonCount:  c._count.lessons,
        studentCount: c._count.enrollments,
        createdAt:    c.createdAt,
      })),
      meta: { page, pageSize, total },
    };
  }

  async getCourse(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: true,
        lessons: {
          orderBy: { order: 'asc' },
          select: {
            id: true, title: true, order: true, estimatedMin: true,
            isPublished: true, videoKey: true, videoStatus: true,
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async createCourse(dto: {
    title: string; slug: string; description: string;
    difficulty: Difficulty; priceType?: PriceType;
    coinPrice?: number; moneyPrice?: number;
    categoryId?: string; hasCertificate?: boolean;
  }) {
    const slugExists = await this.prisma.course.findUnique({
      where: { slug: dto.slug },
    });
    if (slugExists) throw new ConflictException('Slug already exists');

    // categoryId Prisma relation uchun connect syntax talab qiladi
    // spread dan ayrish — type conflict bo'lmasin
    const data: any = {
      title:          dto.title,
      slug:           dto.slug,
      description:    dto.description,
      difficulty:     dto.difficulty,
      priceType:      dto.priceType      ?? PriceType.FREE,
      coinPrice:      dto.coinPrice,
      moneyPrice:     dto.moneyPrice,
      hasCertificate: dto.hasCertificate ?? false,
      isPublished:    false,
    };

    if (dto.categoryId) {
      data.category = { connect: { id: dto.categoryId } };
    }

    return this.prisma.course.create({ data });
  }

  async updateCourse(id: string, dto: Partial<{
    title: string; slug: string; description: string;
    difficulty: Difficulty; priceType: PriceType;
    coinPrice: number; moneyPrice: number;
    categoryId: string; hasCertificate: boolean; isPublished: boolean;
  }>) {
    await this._findCourseOrThrow(id);

    if (dto.slug) {
      const conflict = await this.prisma.course.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (conflict) throw new ConflictException('Slug already taken');
    }

    // categoryId ni Prisma connect syntax ga o'tkazish
    const { categoryId, ...rest } = dto;

    return this.prisma.course.update({
      where: { id },
      data: {
        ...rest,
        ...(categoryId !== undefined
          ? { category: { connect: { id: categoryId } } }
          : {}),
      },
    });
  }

  async publishCourse(id: string) {
    await this._findCourseOrThrow(id);
    return this.prisma.course.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  async unpublishCourse(id: string) {
    await this._findCourseOrThrow(id);
    return this.prisma.course.update({
      where: { id },
      data: { isPublished: false },
    });
  }

  async deleteCourse(id: string, force = false) {
    const course = await this._findCourseOrThrow(id);
    const enrolled = await this.prisma.enrollment.count({ where: { courseId: id } });

    if (enrolled > 0 && !force) {
      throw new BadRequestException(
        `Bu kursda ${enrolled} ta o'quvchi bor. Majburan o'chirish uchun force=true yuboring.`
      );
    }

    // delete cover image file
    if (course.coverImage) {
      const p = path.join(COVER_DIR(), path.basename(course.coverImage));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // delete all video files for lessons of this course
    const lessons = await this.prisma.lesson.findMany({
      where:  { courseId: id },
      select: { id: true, videoKey: true },   // id kerak — lessonIds uchun
    });
    for (const l of lessons) {
      if (l.videoKey) {
        const dir = path.join(VIDEO_DIR(), l.videoKey);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    // delete all related records in correct order (RESTRICT foreign keys)
    const lessonIds = lessons.map(l => l.id);

    await this.prisma.$transaction(async (tx) => {
      // 1. lesson-level data (faqat darslar mavjud bo'lsa)
      if (lessonIds.length > 0) {
        await tx.lessonProgress.deleteMany({
          where: { lessonId: { in: lessonIds } },
        });

        // xpEvent — lessonId field mavjud bo'lsa
        try {
          await tx.xpEvent.deleteMany({
            where: { lessonId: { in: lessonIds } },
          });
        } catch {}

        // submission — check if this relationship exists in your schema
        // If submissions don't relate directly to lessons, remove this block
        // or update the field name to match your Prisma schema
      }

      // 2. course-level data
      await tx.certificate.deleteMany({ where: { courseId: id } });
      await tx.enrollment.deleteMany({ where: { courseId: id } });
      await tx.courseReview.deleteMany({ where: { courseId: id } });

      // 3. lessons themselves
      await tx.lesson.deleteMany({ where: { courseId: id } });
    });

    return this.prisma.course.delete({ where: { id } });
  }

  async uploadCourseCover(courseId: string, file: Express.Multer.File): Promise<{ coverUrl: string }> {
    const course = await this._findCourseOrThrow(courseId);

    // remove old cover
    if (course.coverImage) {
      const old = path.join(COVER_DIR(), path.basename(course.coverImage));
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    // DB da relative path saqlash (backend URL ga bog'liq bo'lmasligi uchun)
    const relativePath = `/uploads/covers/${file.filename}`;
    await this.prisma.course.update({
      where: { id: courseId },
      data:  { coverImage: relativePath },
    });

    // Frontend uchun to'liq URL qaytaramiz
    const baseUrl = process.env.BACKEND_URL ?? `http://localhost:3000`;
    return { coverUrl: `${baseUrl}${relativePath}` };
  }

  // ═══════════════════════════════════════════════════════
  //  LESSONS
  // ═══════════════════════════════════════════════════════

  async listLessons(courseId: string) {
    await this._findCourseOrThrow(courseId);
    return this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      select: {
        id: true, title: true, order: true, estimatedMin: true,
        isPublished: true, videoKey: true, videoStatus: true,
        createdAt: true,
      },
    });
  }

  async getLesson(id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  async createLesson(dto: {
    title: string; content: string; order: number;
    courseId: string; estimatedMin?: number; isPublished?: boolean;
  }) {
    await this._findCourseOrThrow(dto.courseId);

    // check order conflict and auto-shift
    const conflict = await this.prisma.lesson.findUnique({
      where: { courseId_order: { courseId: dto.courseId, order: dto.order } },
    });

    if (conflict) {
      // shift all lessons with order >= dto.order down by 1
      await this.prisma.lesson.updateMany({
        where: { courseId: dto.courseId, order: { gte: dto.order } },
        data:  { order: { increment: 1 } },
      });
    }

    return this.prisma.lesson.create({
      data: {
        title:        dto.title,
        content:      dto.content,
        order:        dto.order,
        courseId:     dto.courseId,
        estimatedMin: dto.estimatedMin,
        isPublished:  dto.isPublished ?? false,
      },
    });
  }

  async updateLesson(id: string, dto: Partial<{
    title: string; content: string; order: number;
    estimatedMin: number; isPublished: boolean;
  }>) {
    const lesson = await this._findLessonOrThrow(id);

    if (dto.order !== undefined && dto.order !== lesson.order) {
      const conflict = await this.prisma.lesson.findUnique({
        where: { courseId_order: { courseId: lesson.courseId, order: dto.order } },
      });
      if (conflict) {
        await this.prisma.lesson.updateMany({
          where: { courseId: lesson.courseId, order: { gte: dto.order }, NOT: { id } },
          data:  { order: { increment: 1 } },
        });
      }
    }

    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async publishLesson(id: string) {
    await this._findLessonOrThrow(id);
    return this.prisma.lesson.update({
      where: { id },
      data:  { isPublished: true },
    });
  }

  async unpublishLesson(id: string) {
    await this._findLessonOrThrow(id);
    return this.prisma.lesson.update({
      where: { id },
      data:  { isPublished: false },
    });
  }

  async deleteLesson(id: string) {
    const lesson = await this._findLessonOrThrow(id);

    if (lesson.videoKey) {
      const dir = path.join(VIDEO_DIR(), lesson.videoKey);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }

    const deleted = await this.prisma.lesson.delete({ where: { id } });

    // re-normalize order for remaining lessons
    await this._normalizeOrder(lesson.courseId);

    return deleted;
  }

  async reorderLessons(courseId: string, items: { id: string; order: number }[]) {
    await this._findCourseOrThrow(courseId);

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.lesson.update({
          where: { id: item.id },
          data:  { order: item.order },
        })
      )
    );

    return { reordered: items.length };
  }

  // ── Video upload → Bull queue ──────────────────────────────────────────────

  async uploadLessonVideo(lessonId: string, file: Express.Multer.File) {
    const lesson = await this._findLessonOrThrow(lessonId);

    // remove old video if exists
    if (lesson.videoKey) {
      const dir = path.join(VIDEO_DIR(), lesson.videoKey);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data:  { videoStatus: 'PROCESSING', videoKey: null },
    });

    const job = await this.videoQueue.add(
      'encode',
      { lessonId, tempPath: file.path },
      { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true }
    );

    return { message: 'Video queued for encoding', jobId: job.id };
  }

  async getVideoStatus(lessonId: string) {
    const lesson = await this._findLessonOrThrow(lessonId);
    return {
      lessonId:    lesson.id,
      videoStatus: lesson.videoStatus,
      videoKey:    lesson.videoKey,
      videoReady:  lesson.videoStatus === 'READY',
    };
  }

  async deleteVideo(lessonId: string) {
    const lesson = await this._findLessonOrThrow(lessonId);
    if (!lesson.videoKey) throw new BadRequestException('No video attached');

    const dir = path.join(VIDEO_DIR(), lesson.videoKey);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

    return this.prisma.lesson.update({
      where: { id: lessonId },
      data:  { videoKey: null, videoStatus: 'NONE' },
    });
  }

  // ═══════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  private async _findCourseOrThrow(id: string) {
    const c = await this.prisma.course.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Course not found');
    return c;
  }

  private async _findLessonOrThrow(id: string) {
    const l = await this.prisma.lesson.findUnique({ where: { id } });
    if (!l) throw new NotFoundException('Lesson not found');
    return l;
  }

  private async _findCategoryOrThrow(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  private async _normalizeOrder(courseId: string) {
    const lessons = await this.prisma.lesson.findMany({
      where:   { courseId },
      orderBy: { order: 'asc' },
      select:  { id: true },
    });
    await this.prisma.$transaction(
      lessons.map((l, i) =>
        this.prisma.lesson.update({ where: { id: l.id }, data: { order: i + 1 } })
      )
    );
  }
}
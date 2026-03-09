import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonUnlockService } from './lesson-unlock.service';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const VIDEO_DIR = () => process.env.VIDEO_OUTPUT_DIR ?? '/var/www/secure-videos';

@Injectable()
export class LessonsService {
  constructor(
    private prisma: PrismaService,
    private unlock: LessonUnlockService,
    @InjectQueue('video') private videoQueue: Queue,
  ) {}

  // ── ADMIN: create ──────────────────────────────────────────────────────────
  async create(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
    if (!course) throw new NotFoundException('Course not found');
    return this.prisma.lesson.create({ data: dto });
  }

  // ── ADMIN: update ──────────────────────────────────────────────────────────
  async update(actor: any, id: string, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  // ── ADMIN: delete ──────────────────────────────────────────────────────────
  async delete(actor: any, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (lesson?.videoKey) {
      const dir = path.join(VIDEO_DIR(), lesson.videoKey);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    return this.prisma.lesson.delete({ where: { id } });
  }

  // ── ADMIN: publish ─────────────────────────────────────────────────────────
  async publish(actor: any, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    return this.prisma.lesson.update({ where: { id }, data: { isPublished: true } });
  }

  // ── ADMIN: video upload → Bull queue ──────────────────────────────────────
  async uploadVideo(actor: any, lessonId: string, file: Express.Multer.File) {
    if (actor.role !== Role.ADMIN) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new ForbiddenException();
    }

    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new NotFoundException('Lesson not found');
    }

    if (lesson.videoKey) {
      const oldDir = path.join(VIDEO_DIR(), lesson.videoKey);
      if (fs.existsSync(oldDir)) fs.rmSync(oldDir, { recursive: true, force: true });
    }

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data:  { videoStatus: 'PROCESSING', videoKey: null },
    });

    const job = await this.videoQueue.add(
      'encode',
      { lessonId, tempPath: file.path },
      { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: true },
    );

    return { message: 'Video uploading. Encoding started.', jobId: job.id };
  }

  // ── ADMIN: encoding status ─────────────────────────────────────────────────
  async getVideoStatus(actor: any, lessonId: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    const lesson = await this.prisma.lesson.findUnique({
      where:  { id: lessonId },
      select: { id: true, videoStatus: true, videoKey: true },
    });
    if (!lesson) throw new NotFoundException();
    return lesson;
  }

  // ── USER: HLS master playlist ──────────────────────────────────────────────
  async streamLesson(lessonId: string, userId: string, res: Response) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson?.videoKey)              throw new NotFoundException('Video not found');
    if (lesson.videoStatus !== 'READY') throw new BadRequestException('Video is still processing');

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: lesson.courseId },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled');

    const canAccess = await this.unlock.canAccess(userId, lessonId);
    if (!canAccess) throw new ForbiddenException('Complete previous lesson first');

    res.setHeader('X-Accel-Redirect', `/protected/${lesson.videoKey}/index.m3u8`);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.end();
  }

  // ── USER: HLS segments ─────────────────────────────────────────────────────
  async streamSegment(lessonId: string, filename: string, userId: string, res: Response) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson?.videoKey || lesson.videoStatus !== 'READY') throw new NotFoundException();

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: lesson.courseId },
    });
    if (!enrollment) throw new ForbiddenException();

    res.setHeader('X-Accel-Redirect', `/protected/${lesson.videoKey}/${filename}`);
    res.setHeader(
      'Content-Type',
      filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
    );
    res.end();
  }

  // ── USER: lesson detail ────────────────────────────────────────────────────
  async getLessonDetail(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where:   { id: lessonId },
      include: { course: { select: { id: true } } },
    });
    if (!lesson || !lesson.isPublished) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: lesson.courseId } },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled');

    const isUnlocked = await this.unlock.canAccess(userId, lessonId);
    if (!isUnlocked) throw new ForbiddenException('Complete previous lesson first');

    const progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });

    const [prev, next] = await Promise.all([
      this.prisma.lesson.findFirst({
        where:  { courseId: lesson.courseId, isPublished: true, order: lesson.order - 1 },
        select: { id: true },
      }),
      this.prisma.lesson.findFirst({
        where:  { courseId: lesson.courseId, isPublished: true, order: lesson.order + 1 },
        select: { id: true },
      }),
    ]);

    const videoReady = lesson.videoKey && lesson.videoStatus === 'READY';

    return {
      id:          lesson.id,
      title:       lesson.title,
      type:        videoReady
        ? 'VIDEO'
        : lesson.videoStatus === 'PROCESSING'
        ? 'PROCESSING'
        : 'TEXT',
      content:          lesson.content,
      durationMin:      lesson.estimatedMin ?? 0,
      videoUrl:         videoReady ? `/api/v1/lessons/${lesson.id}/stream` : null,
      videoStatus:      lesson.videoStatus,
      completed:        !!progress?.completed,
      isUnlocked:       true,
      previousLessonId: prev?.id ?? null,
      nextLessonId:     next?.id ?? null,
    };
  }

  // ── USER: mark complete ────────────────────────────────────────────────────
  async markComplete(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException();

    const canAccess = await this.unlock.canAccess(userId, lessonId);
    if (!canAccess) throw new ForbiddenException('Lesson is locked');

    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    if (existing?.completed) return { message: 'Already completed' };

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonProgress.upsert({
        where:  { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId, completed: true },
        update: { completed: true },
      });
      if (!existing) {
        await tx.xpEvent.create({
          data: { userId, amount: 10, reason: 'LESSON_COMPLETION', lessonId },
        });
        await tx.user.update({
          where: { id: userId },
          data:  { xp: { increment: 10 } },
        });
      }
    });

    return { message: 'Lesson completed', lessonId };
  }
}
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  async create(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });

    if (!course) throw new NotFoundException('Course not found');

    return this.prisma.lesson.create({
      data: dto,
    });
  }

  async update(actor: any, id: string, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    return this.prisma.lesson.update({
      where: { id },
      data: dto,
    });
  }

  async delete(actor: any, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    return this.prisma.lesson.delete({
      where: { id },
    });
  }

  async publish(actor: any, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    return this.prisma.lesson.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  async processVideo(lessonId: string, tempPath: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });

    if (!lesson) throw new NotFoundException();

    const videoKey = `lesson-${lessonId}`;
    const outputDir = `/var/www/secure-videos/${videoKey}`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'index.m3u8');

    // ⚠️ NOTE: avvalgi kodingdagi "-codec: copy" xato yozilgan bo'lishi mumkin.
    // ffmpeg to'g'ri flag: "-codec copy"
    // Men production uchun to'g'riladim.
    const cmd = `
    ffmpeg -i "${tempPath}" \
    -codec copy \
    -start_number 0 \
    -hls_time 10 \
    -hls_list_size 0 \
    -f hls "${outputPath}"
  `;

    await new Promise((resolve, reject) => {
      exec(cmd, (error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { videoKey },
    });

    fs.unlinkSync(tempPath);

    return { message: 'Video processed successfully' };
  }

  async streamLesson(
    lessonId: string,
    userId: string,
    res: Response,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });

    if (!lesson || !lesson.videoKey) throw new NotFoundException();

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        courseId: lesson.courseId,
      },
    });

    if (!enrollment) throw new ForbiddenException('Not enrolled');

    res.setHeader(
      'X-Accel-Redirect',
      `/protected/${lesson.videoKey}/index.m3u8`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.apple.mpegurl',
    );

    return res.end();
  }

  // ✅ 8) LESSON DETAIL ENDPOINT (frontend uchun kerakli hamma fieldlar)
  async getLessonDetail(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: { select: { id: true, isPublished: true } },
      },
    });

    if (!lesson || !lesson.isPublished) {
      throw new NotFoundException('Lesson not found');
    }

    // Enrollment check
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: lesson.courseId,
        },
      },
    });

    if (!enrollment) throw new ForbiddenException('Not enrolled');

    // Completed?
    const progress = await this.prisma.lessonProgress.findUnique({
      where: {
        userId_lessonId: { userId, lessonId },
      },
    });

    const completed = !!progress?.completed;

    // Prev/Next
    const [previousLesson, nextLesson] = await Promise.all([
      this.prisma.lesson.findFirst({
        where: {
          courseId: lesson.courseId,
          isPublished: true,
          order: lesson.order - 1,
        },
        select: { id: true },
      }),
      this.prisma.lesson.findFirst({
        where: {
          courseId: lesson.courseId,
          isPublished: true,
          order: lesson.order + 1,
        },
        select: { id: true },
      }),
    ]);

    // Unlock logic: first OR previous completed
    let isUnlocked = false;
    if (!previousLesson) {
      isUnlocked = true;
    } else {
      const prevProgress = await this.prisma.lessonProgress.findUnique({
        where: {
          userId_lessonId: { userId, lessonId: previousLesson.id },
        },
      });
      isUnlocked = !!prevProgress?.completed;
    }

    const type: 'VIDEO' | 'TEXT' = lesson.videoKey ? 'VIDEO' : 'TEXT';

    return {
      id: lesson.id,
      title: lesson.title,

      type,
      content: lesson.content,

      durationMin: lesson.estimatedMin || 0,

      // VIDEO bo'lsa
      videoUrl: lesson.videoKey
        ? `/api/v1/lessons/${lesson.id}/stream`
        : null,

      isUnlocked,
      completed,

      nextLessonId: nextLesson?.id || null,
      previousLessonId: previousLesson?.id || null,
    };
  }
}
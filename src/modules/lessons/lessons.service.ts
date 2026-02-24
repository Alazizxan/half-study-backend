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
  constructor(private prisma: PrismaService) { }

  async create(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });

    if (!course)
      throw new NotFoundException('Course not found');

    return this.prisma.lesson.create({
      data: dto,
    });
  }

  async getById(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });

    if (!lesson)
      throw new NotFoundException();

    return lesson;
  }

  async update(actor: any, id: string, dto: any) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.lesson.update({
      where: { id },
      data: dto,
    });
  }

  async delete(actor: any, id: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.lesson.delete({
      where: { id },
    });
  }

  async publish(actor: any, id: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.lesson.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  async processVideo(lessonId: string, tempPath: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });

    if (!lesson)
      throw new NotFoundException();

    const videoKey = `lesson-${lessonId}`;
    const outputDir = `/var/www/secure-videos/${videoKey}`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'index.m3u8');

    const cmd = `
    ffmpeg -i ${tempPath} \
    -codec: copy \
    -start_number 0 \
    -hls_time 10 \
    -hls_list_size 0 \
    -f hls ${outputPath}
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

    if (!lesson || !lesson.videoKey)
      throw new NotFoundException();

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        courseId: lesson.courseId,
      },
    });

    if (!enrollment)
      throw new ForbiddenException('Not enrolled');

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

}






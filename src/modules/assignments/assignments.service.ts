// ─── assignments/assignments.service.ts ──────────────────────────────────────
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { Role } from '@prisma/client';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private upload: UploadService,
  ) {}

  async create(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    return this.prisma.assignment.create({ data: dto });
  }

  async getById(id: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      include: { lesson: true },
    });
    if (!a) throw new NotFoundException();
    return a;
  }

  async listByLesson(lessonId: string) {
    return this.prisma.assignment.findMany({
      where: { lessonId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(actor: any, id: string, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    return this.prisma.assignment.update({ where: { id }, data: dto });
  }

  async delete(actor: any, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    return this.prisma.assignment.delete({ where: { id } });
  }
}

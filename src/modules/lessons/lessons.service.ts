import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

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
}
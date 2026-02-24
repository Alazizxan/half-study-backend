import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async create(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.course.create({
      data: dto,
    });
  }

  async publish(actor: any, id: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.course.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  async list(page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where: { isPublished: true },
        skip,
        take: pageSize,
        include: { category: true },
      }),
      this.prisma.course.count({
        where: { isPublished: true },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  async getBySlug(slug: string) {
    return this.prisma.course.findUnique({
      where: { slug },
      include: {
        lessons: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
        },
        category: true,
      },
    });
  }
}
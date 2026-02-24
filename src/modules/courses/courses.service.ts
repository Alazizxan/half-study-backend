import { Injectable,NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) { }

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

  async enroll(userId: string, courseId: string) {
    return this.prisma.$transaction(async (tx) => {

      const course = await tx.course.findUnique({
        where: { id: courseId },
      });

      if (!course || !course.isPublished)
        throw new NotFoundException('Course not found');

      const existing = await tx.enrollment.findFirst({
        where: { userId, courseId },
      });

      if (existing)
        throw new ForbiddenException('Already enrolled');

      // FREE COURSE
      if (course.priceType === 'FREE') {
        return tx.enrollment.create({
          data: { userId, courseId },
        });
      }

      // COIN COURSE
      if (course.priceType === 'COINS') {

        if (!course.coinPrice)
          throw new ForbiddenException('Invalid course price');

        const balance = await tx.coinEvent.aggregate({
          where: { userId },
          _sum: { amount: true },
        });

        const userBalance = balance._sum.amount || 0;

        if (userBalance < course.coinPrice)
          throw new ForbiddenException('Not enough coins');

        // deduct coins
        await tx.coinEvent.create({
          data: {
            userId,
            amount: -course.coinPrice,
            reason: 'TRANSFER_OUT',
          },
        });

        return tx.enrollment.create({
          data: { userId, courseId },
        });
      }

      throw new ForbiddenException('Unsupported payment type');
    });
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
import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PriceType, CoinReason } from '@prisma/client';

@Injectable()
export class EnrollmentService {
  constructor(private prisma: PrismaService) {}

  async enroll(userId: string, courseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.findUnique({
        where: { id: courseId },
      });

      if (!course || !course.isPublished)
        throw new ForbiddenException('Course not available');

      // Idempotent check
      const existing = await tx.enrollment.findUnique({
        where: {
          userId_courseId: { userId, courseId },
        },
      });

      if (existing) return { message: 'Already enrolled' };

      // FREE
      if (course.priceType === PriceType.FREE) {
        await tx.enrollment.create({
          data: { userId, courseId },
        });

        return { message: 'Enrolled (FREE)' };
      }

      // COINS
      if (course.priceType === PriceType.COINS) {
        if (!course.coinPrice)
          throw new BadRequestException('Invalid coin price');

        const balanceAgg = await tx.coinEvent.aggregate({
          where: { userId },
          _sum: { amount: true },
        });

        const balance = balanceAgg._sum.amount || 0;

        if (balance < course.coinPrice)
          throw new ForbiddenException('Insufficient coins');

        // deduct coins
        await tx.coinEvent.create({
          data: {
            userId,
            amount: -course.coinPrice,
            reason: CoinReason.TRANSFER_OUT,
          },
        });

        await tx.enrollment.create({
          data: { userId, courseId },
        });

        return { message: 'Enrolled (COINS)' };
      }

      // PAID
      if (course.priceType === PriceType.PAID) {
        throw new ForbiddenException('Paid course requires payment approval');
      }
    });
  }

  async checkAccess(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
    });

    return !!enrollment;
  }
}

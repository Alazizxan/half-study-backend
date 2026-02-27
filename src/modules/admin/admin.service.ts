import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) { }

  async dashboard(actor: any) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const dau = await this.prisma.user.count({
      where: {
        updatedAt: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
        },
      },
    });

    const mau = await this.prisma.user.count({
      where: {
        updatedAt: {
          gte: thirtyDaysAgo,
        },
      },
    });

    const totalUsers = await this.prisma.user.count();
    const totalCourses = await this.prisma.course.count();
    const totalSubmissions = await this.prisma.submission.count();

    const approvedSubmissions = await this.prisma.submission.count({
      where: { status: 'APPROVED' },
    });

    return {
      data: {
        totalUsers,
        totalCourses,
        totalSubmissions,
        approvedSubmissions,
        dau,
        mau,
      },
    };
  }

  async broadcast(dto: { title: string; body: string }) {
    const users = await this.prisma.user.findMany({ select: { id: true } });

    await this.prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        type: 'SYSTEM',
        title: dto.title,
        body: dto.body,
      })),
    });

    return { sent: users.length };
  }

  async revenue() {
    const purchases = await this.prisma.coinEvent.aggregate({
      where: { reason: 'TRANSFER_OUT' },
      _sum: { amount: true },
    });

    return {
      totalCoinsSpent: Math.abs(purchases._sum.amount || 0),
    };
  }


  async refund(dto: { userId: string; courseId: string }) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });

    if (!course?.coinPrice)
      throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.enrollment.delete({
        where: {
          userId_courseId: {
            userId: dto.userId,
            courseId: dto.courseId,
          },
        },
      }),
      this.prisma.coinEvent.create({
        data: {
          userId: dto.userId,
          amount: course.coinPrice,
          reason: 'TRANSFER_IN',
        },
      }),
    ]);

    return { refunded: true };
  }
}
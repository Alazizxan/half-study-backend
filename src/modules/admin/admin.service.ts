import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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
}
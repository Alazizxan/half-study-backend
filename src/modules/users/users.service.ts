import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async updateProfile(userId: string, dto: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
  }

  async changeRole(actor: any, targetId: string, role: Role) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.user.update({
      where: { id: targetId },
      data: { role },
    });
  }

  async banUser(actor: any, targetId: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.user.update({
      where: { id: targetId },
      data: {
        lockedUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      },
    });
  }

  async unbanUser(actor: any, targetId: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.user.update({
      where: { id: targetId },
      data: { lockedUntil: null },
    });
  }

  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException();

    const enrolledCourses = await this.prisma.enrollment.count({
      where: { userId },
    });

    const completedCourses = await this.prisma.course.count({
      where: {
        enrollments: { some: { userId } },
        lessons: {
          every: {
            progresses: {
              some: { userId, completed: true },
            },
          },
        },
      },
    });

    const achievementsUnlocked =
      await this.prisma.userAchievement.count({
        where: { userId },
      });

    return {
      streak: user.currentStreak,
      level: user.level,
      xp: user.xp,
      xpToNextLevel: user.level * 1000,
      enrolledCourses,
      completedCourses,
      achievementsUnlocked,
    };
  }

  async getAchievements(userId: string) {
    return this.prisma.userAchievement.findMany({
      where: { userId },
      include: {
        achievement: true,
      },
      orderBy: { unlockedAt: 'desc' },
    });
  }


  async getMyCourses(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            lessons: true,
          },
        },
      },
    });

    return Promise.all(
      enrollments.map(async (e) => {
        const totalLessons = e.course.lessons.length;

        const completed = await this.prisma.lessonProgress.count({
          where: {
            userId,
            completed: true,
            lesson: {
              courseId: e.course.id,
            },
          },
        });

        return {
          course: {
            id: e.course.id,
            title: e.course.title,
            coverImage: e.course.coverImage,
            difficulty: e.course.difficulty,
          },
          progress:
            totalLessons === 0
              ? 0
              : Math.floor((completed / totalLessons) * 100),
          lessonsCount: totalLessons,
        };
      }),
    );
  }

}
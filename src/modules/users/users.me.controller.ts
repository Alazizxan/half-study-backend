import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/v1/users/me')
@UseGuards(JwtAuthGuard)
export class UsersMeController {
  constructor(private prisma: PrismaService) {}

  @Get('continue-learning')
  async continueLearning(@CurrentUser() user: any) {
    const userId = user.sub;

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const results: Array<{
      courseId: string;
      courseTitle: string;
      slug: string;
      progress: number;
      lastLessonId: string;
    }> = [];

    for (const enr of enrollments) {
      const courseId = enr.course.id;

      const lessons = await this.prisma.lesson.findMany({
        where: { courseId, isPublished: true },
        orderBy: { order: 'asc' },
        select: { id: true },
      });

      if (lessons.length === 0) continue;

      const progresses = await this.prisma.lessonProgress.findMany({
        where: {
          userId,
          lesson: { courseId },
        },
        orderBy: { updatedAt: 'desc' },
        select: { lessonId: true, completed: true, updatedAt: true },
      });

      const completedSet = new Set(
        progresses.filter((p) => p.completed).map((p) => p.lessonId),
      );

      const progress =
        lessons.length > 0
          ? Math.round((completedSet.size / lessons.length) * 100)
          : 0;

      // oxirgi ko‘rilgan dars (progress bo‘lmasa birinchi dars)
      const lastLessonId = progresses[0]?.lessonId || lessons[0].id;

      results.push({
        courseId,
        courseTitle: enr.course.title,
        slug: enr.course.slug,
        progress,
        lastLessonId,
      });
    }

    return results;
  }
}

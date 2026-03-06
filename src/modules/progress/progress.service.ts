import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { XpService } from '../gamification/xp.service';
import { AchievementService } from '../gamification/achievement.service';

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private xpService: XpService,
    private achievementService: AchievementService,
  ) {}

  async completeLesson(userId: string, lessonId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Lesson mavjudmi
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
      });
      if (!lesson || !lesson.isPublished)
        throw new ForbiddenException('Lesson not available');

      const enrollment = await tx.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: lesson.courseId,
          },
        },
      });

      if (!enrollment)
        throw new ForbiddenException('Not enrolled');

      // 2️⃣ Idempotent check
      const existing = await tx.lessonProgress.findUnique({
        where: {
          userId_lessonId: { userId, lessonId },
        },
      });

      if (existing?.completed) {
        return { message: 'Already completed' };
      }

      // 3️⃣ Sequential unlock check
      const previousLesson = await tx.lesson.findFirst({
        where: {
          courseId: lesson.courseId,
          order: lesson.order - 1,
        },
      });

      if (previousLesson) {
        const prevProgress = await tx.lessonProgress.findUnique({
          where: {
            userId_lessonId: {
              userId,
              lessonId: previousLesson.id,
            },
          },
        });

        if (!prevProgress?.completed)
          throw new ForbiddenException('Previous lesson not completed');
      }

      // 4️⃣ Progress create/update
      await tx.lessonProgress.upsert({
        where: {
          userId_lessonId: { userId, lessonId },
        },
        create: {
          userId,
          lessonId,
          completed: true,
        },
        update: { completed: true },
      });

      // 5️⃣ Reward XP + Coins
      const xpReward = 50;
      const coinReward = 10;

      await tx.xpEvent.create({
        data: {
          userId,
          amount: xpReward,
          reason: 'LESSON_COMPLETION',
          lessonId,
        },
      });

      // 🔥 UPDATE USER XP + LEVEL
      await this.xpService.addXp(userId, xpReward);

      // 🔥 FIRST LESSON ACHIEVEMENT
      await this.achievementService.unlock(userId, 'First Lesson');

      const totalLessons = await tx.lesson.count({
        where: { courseId: lesson.courseId, isPublished: true },
      });

      const completedLessons = await tx.lessonProgress.count({
        where: {
          userId,
          completed: true,
          lesson: {
            courseId: lesson.courseId,
          },
        },
      });

      if (completedLessons === totalLessons) {
        await this.achievementService.unlock(userId, 'First Course Complete');
        await this.xpService.addXp(userId, 300);
      }

      await tx.coinEvent.create({
        data: {
          userId,
          amount: coinReward,
          reason: 'LESSON_COMPLETION',
          lessonId,
        },
      });

      return {
        message: 'Lesson completed',
        xpReward,
        coinReward,
      };
    });
  }

  // ✅ NEW: GET /api/v1/progress/course/:slug
  async getCourseProgress(userId: string, slug: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true, isPublished: true },
    });

    if (!course || !course.isPublished)
      throw new NotFoundException('Course not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    });

    if (!enrollment) {
      return {
        percent: 0,
        completedLessons: 0,
        totalLessons: 0,
        nextLessonId: null,
      };
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { courseId: course.id, isPublished: true },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    const totalLessons = lessons.length;

    const progresses = await this.prisma.lessonProgress.findMany({
      where: { userId, lesson: { courseId: course.id } },
      select: { lessonId: true, completed: true },
    });

    const completedSet = new Set(
      progresses.filter((p) => p.completed).map((p) => p.lessonId),
    );

    const completedLessons = completedSet.size;

    const percent =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    let nextLessonId: string | null = null;
    for (let i = 0; i < lessons.length; i++) {
      const id = lessons[i].id;
      const done = completedSet.has(id);

      if (i === 0) {
        if (!done) {
          nextLessonId = id;
          break;
        }
      } else {
        const prevId = lessons[i - 1].id;
        if (completedSet.has(prevId) && !done) {
          nextLessonId = id;
          break;
        }
      }
    }

    return {
      percent,
      completedLessons,
      totalLessons,
      nextLessonId,
    };
  }
}
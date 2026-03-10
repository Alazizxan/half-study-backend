import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmissionStatus } from '@prisma/client';

type LessonUnlockItem = {
  id: string;
  title: string;
  order: number;
  estimatedMin: number | null;
  isPublished: boolean;
  isUnlocked: boolean;
  isCompleted: boolean;
  quiz: {
    id: string;
    title: string;
    isRequired: boolean;
    passingScore: number;
    userStatus: 'PASSED' | 'FAILED' | 'NOT_ATTEMPTED';
  } | null;
  assignments: Array<{
    id: string;
    title: string;
    isRequired: boolean;
  }>;
};

@Injectable()
export class LessonUnlockService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns true if user can access the given lesson.
   * Rules:
   *  1. First lesson of course — always unlocked (if enrolled)
   *  2. Previous lesson must be completed
   *  3. If previous lesson has REQUIRED quiz → must be PASSED
   *  4. If previous lesson has REQUIRED assignment → must be APPROVED
   */
  async canAccess(userId: string, lessonId: string): Promise<boolean> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: {
          include: {
            enrollments: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!lesson) return false;

    // Must be enrolled
    if (!lesson.course.enrollments.length) return false;

    // First lesson — accessible
    if (lesson.order === 1) return true;

    // Previous lesson
    const prev = await this.prisma.lesson.findUnique({
      where: {
        courseId_order: {
          courseId: lesson.courseId,
          order: lesson.order - 1,
        },
      },
      include: {
        progresses: { where: { userId } },

        // ⚠️ Agar schema’da quiz relation yo‘q bo‘lsa, shu blokni olib tashlash kerak.
        quiz: {
          select: {
            id: true,
            isRequired: true,
          },
        },

        assignments: {
          select: {
            id: true,
            isRequired: true,
          },
        },
      },
    });

    if (!prev) return true;

    const prevCompleted = prev.progresses?.[0]?.completed ?? false;
    if (!prevCompleted) return false;

    // Required quiz check
    if (prev.quiz?.isRequired) {
      const passed = await this.prisma.quizAttempt.findFirst({
        where: {
          quizId: prev.quiz.id,
          userId,
          passed: true,
        },
      });

      if (!passed) return false;
    }

    // Required assignments check
    const requiredAssignments = prev.assignments.filter((a) => a.isRequired);

    for (const assignment of requiredAssignments) {
      const approved = await this.prisma.submission.findFirst({
        where: {
          userId,
          assignmentId: assignment.id,
          status: SubmissionStatus.APPROVED,
        },
      });

      if (!approved) return false;
    }

    return true;
  }

  /**
   * Full lesson list with unlock status
   */
  async getLessonsWithUnlockStatus(
    userId: string,
    courseId: string,
  ): Promise<LessonUnlockItem[]> {
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: {
        progresses: { where: { userId } },

        // ⚠️ Agar schema’da quiz relation yo‘q bo‘lsa, shu blokni olib tashlash kerak.
        quiz: {
          select: {
            id: true,
            isRequired: true,
            title: true,
            passingScore: true,
          },
        },

        assignments: {
          select: {
            id: true,
            title: true,
            isRequired: true,
          },
        },
      },
    });

    const results: LessonUnlockItem[] = [];

    for (const lesson of lessons) {
      const isUnlocked = await this.canAccess(userId, lesson.id);
      const isCompleted = lesson.progresses?.[0]?.completed ?? false;

      let quizStatus: 'PASSED' | 'FAILED' | 'NOT_ATTEMPTED' | null = null;

      if (lesson.quiz) {
        const bestAttempt = await this.prisma.quizAttempt.findFirst({
          where: {
            quizId: lesson.quiz.id,
            userId,
          },
          orderBy: {
            score: 'desc',
          },
        });

        quizStatus = bestAttempt?.passed
          ? 'PASSED'
          : bestAttempt
            ? 'FAILED'
            : 'NOT_ATTEMPTED';
      }

      results.push({
        id: lesson.id,
        title: lesson.title,
        order: lesson.order,
        estimatedMin: lesson.estimatedMin,
        isPublished: lesson.isPublished,
        isUnlocked,
        isCompleted,
        quiz: lesson.quiz
          ? {
              id: lesson.quiz.id,
              title: lesson.quiz.title,
              isRequired: lesson.quiz.isRequired,
              passingScore: lesson.quiz.passingScore,
              userStatus: quizStatus ?? 'NOT_ATTEMPTED',
            }
          : null,
        assignments: lesson.assignments.map((a) => ({
          id: a.id,
          title: a.title,
          isRequired: a.isRequired,
        })),
      });
    }

    return results;
  }
}

import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmissionStatus } from '@prisma/client';

@Injectable()
export class LessonUnlockService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns true if user can access the given lesson.
   * 1. Must be enrolled
   * 2. First lesson (order=1) — always unlocked
   * 3. Previous lesson must be completed
   * 4. If previous has required quiz — must be passed
   * 5. If previous has required assignment — must be approved
   */
  async canAccess(userId: string, lessonId: string): Promise<boolean> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: { include: { enrollments: { where: { userId } } } } },
    });

    if (!lesson) return false;
    if (!lesson.course.enrollments.length) return false;
    if (lesson.order === 1) return true;

    const prev = await this.prisma.lesson.findUnique({
      where: {
        courseId_order: { courseId: lesson.courseId, order: lesson.order - 1 },
      },
      include: {
        progresses: { where: { userId } },
        quiz: { select: { id: true, isRequired: true } },
        assignments: { select: { id: true, isRequired: true } },
      },
    });

    if (!prev) return true;

    const prevCompleted = prev.progresses?.[0]?.completed ?? false;
    if (!prevCompleted) return false;

    if (prev.quiz?.isRequired) {
      const passed = await this.prisma.quizAttempt.findFirst({
        where: { quizId: prev.quiz.id, userId, passed: true },
      });
      if (!passed) return false;
    }

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
   * Full lesson list with unlock/complete status per user.
   * Used in player sidebar.
   */
  async getLessonsWithUnlockStatus(userId: string, courseId: string) {
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: {
        progresses: { where: { userId } },
        quiz: {
          select: {
            id: true,
            isRequired: true,
            title: true,
            passingScore: true,
          },
        },
        assignments: { select: { id: true, title: true, isRequired: true } },
      },
    });

    // typed array — "never" xatosini hal qiladi
    const results: Array<{
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
        passingScore: number;
        isRequired: boolean;
        userStatus: 'PASSED' | 'FAILED' | 'NOT_ATTEMPTED' | null;
      } | null;
      assignments: { id: string; title: string; isRequired: boolean }[];
    }> = [];

    for (const lesson of lessons) {
      const isUnlocked = await this.canAccess(userId, lesson.id);
      const isCompleted = lesson.progresses?.[0]?.completed ?? false;

      let quizStatus: 'PASSED' | 'FAILED' | 'NOT_ATTEMPTED' | null = null;
      if (lesson.quiz) {
        const bestAttempt = await this.prisma.quizAttempt.findFirst({
          where: { quizId: lesson.quiz.id, userId },
          orderBy: { score: 'desc' },
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
              passingScore: lesson.quiz.passingScore,
              isRequired: lesson.quiz.isRequired,
              userStatus: quizStatus,
            }
          : null,
        assignments: lesson.assignments,
      });
    }

    return results;
  }
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, QuizAttemptStatus, QuestionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateQuizDto, UpdateQuizDto, SubmitQuizDto } from './dto/quiz.dto';

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  // ─── ADMIN: Create quiz for a lesson ────────────────────────────────────────
  async create(actor: any, dto: CreateQuizDto) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const existing = await this.prisma.quiz.findUnique({
      where: { lessonId: dto.lessonId },
    });
    if (existing) throw new ConflictException('This lesson already has a quiz');

    const { questions, lessonId, ...quizData } = dto;

    return this.prisma.quiz.create({
      data: {
        ...quizData,
        lessonId,
        questions: {
          create: await Promise.all(
            questions.map(async (q, idx) => {
              const { options, flagAnswer, ...qData } = q;

              const hashedFlag = flagAnswer
                ? await bcrypt.hash(flagAnswer.trim().toLowerCase(), 10)
                : undefined;

              return {
                ...qData,
                order: q.order ?? idx,
                flagAnswer: hashedFlag,
                options:
                  options && options.length > 0
                    ? {
                        create: options.map((o, oi) => ({
                          text: o.text,
                          isCorrect: o.isCorrect ?? false,
                          order: o.order ?? oi,
                        })),
                      }
                    : undefined,
              };
            }),
          ),
        },
      },
      include: {
        questions: {
          include: { options: { orderBy: { order: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  // ─── ADMIN: Update quiz ──────────────────────────────────────────────────────
  async update(actor: any, id: string, dto: UpdateQuizDto) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const { questions, lessonId, ...quizData } = dto;

    // If questions are being updated — replace all
    if (questions) {
      // QuizAnswer da questionId FK (RESTRICT) bor — avval o'chir
      await this.prisma.quizAnswer.deleteMany({
        where: { question: { quizId: id } },
      });
      await this.prisma.question.deleteMany({ where: { quizId: id } });
    }

    return this.prisma.quiz.update({
      where: { id },
      data: {
        ...quizData,
        ...(questions && {
          questions: {
            create: await Promise.all(
              questions.map(async (q, idx) => {
                const { options, flagAnswer, ...qData } = q;
                const hashedFlag = flagAnswer
                  ? await bcrypt.hash(flagAnswer.trim().toLowerCase(), 10)
                  : undefined;
                return {
                  ...qData,
                  order: q.order ?? idx,
                  flagAnswer: hashedFlag,
                  options: options?.length
                    ? {
                        create: options.map((o, oi) => ({
                          ...o,
                          order: o.order ?? oi,
                        })),
                      }
                    : undefined,
                };
              }),
            ),
          },
        }),
      },
      include: {
        questions: {
          include: { options: { orderBy: { order: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  // ─── ADMIN: Delete quiz ──────────────────────────────────────────────────────
  async delete(actor: any, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException();

    // FK tartibida o'chirish
    await this.prisma.quizAnswer.deleteMany({
      where: { question: { quizId: id } },
    });
    await this.prisma.quizAttempt.deleteMany({ where: { quizId: id } });
    await this.prisma.question.deleteMany({ where: { quizId: id } });
    return this.prisma.quiz.delete({ where: { id } });
  }

  // ─── PUBLIC: Get quiz for a lesson (hide correct answers) ───────────────────
  async getByLesson(lessonId: string, userId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { lessonId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              select: { id: true, text: true, order: true },
            },
          },
        },
      },
    });
    if (!quiz) return null;

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { quizId: quiz.id, userId },
      orderBy: { startedAt: 'desc' },
    });

    const passed = attempts.some((a) => a.passed === true);
    const attemptsUsed = attempts.length;

    const questions = quiz.shuffleQuestions
      ? [...quiz.questions].sort(() => Math.random() - 0.5)
      : quiz.questions;

    return {
      ...quiz,
      questions,
      userStats: {
        passed,
        attemptsUsed,
        attemptsRemaining: Math.max(0, quiz.maxAttempts - attemptsUsed),
        lastScore: attempts[0]?.score ?? null,
        canAttempt: !passed && attemptsUsed < quiz.maxAttempts,
      },
    };
  }

  // ─── PUBLIC: Get quiz by id (admin — with correct answers) ──────────────────
  async getById(id: string, includeAnswers = false) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              ...(!includeAnswers && {
                select: { id: true, text: true, order: true },
              }),
            },
          },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }

  // ─── USER: Start attempt ─────────────────────────────────────────────────────
  async startAttempt(userId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const attempts = await this.prisma.quizAttempt.count({
      where: { quizId, userId },
    });

    const alreadyPassed = await this.prisma.quizAttempt.findFirst({
      where: { quizId, userId, passed: true },
    });

    if (alreadyPassed)
      throw new BadRequestException('You already passed this quiz');
    if (attempts >= quiz.maxAttempts)
      throw new BadRequestException(
        `Maximum ${quiz.maxAttempts} attempts reached`,
      );

    await this.prisma.quizAttempt.updateMany({
      where: { quizId, userId, status: QuizAttemptStatus.IN_PROGRESS },
      data: { status: QuizAttemptStatus.FAILED },
    });

    return this.prisma.quizAttempt.create({
      data: { quizId, userId, status: QuizAttemptStatus.IN_PROGRESS },
    });
  }

  // ─── USER: Submit attempt ────────────────────────────────────────────────────
  async submitAttempt(userId: string, attemptId: string, dto: SubmitQuizDto) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              include: { options: true },
            },
          },
        },
      },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.userId !== userId) throw new ForbiddenException();
    if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
      throw new BadRequestException('Attempt already submitted');

    const quiz = attempt.quiz;
    let totalPoints = 0;
    let earnedPoints = 0;
    let hasManualQuestions = false;

    const answerCreates = await Promise.all(
      dto.answers.map(async (ans) => {
        const question = quiz.questions.find((q) => q.id === ans.questionId);
        if (!question) return null;

        totalPoints += question.points;
        let isCorrect: boolean | null = null;
        let score = 0;

        switch (question.type) {
          case QuestionType.MULTIPLE_CHOICE:
          case QuestionType.TRUE_FALSE: {
            const correct = question.options.find((o) => o.isCorrect);
            isCorrect = correct?.id === ans.selectedOptionId;
            score = isCorrect ? question.points : 0;
            earnedPoints += score;
            break;
          }

          case QuestionType.FLAG: {
            if (ans.textAnswer && question.flagAnswer) {
              const normalized = ans.textAnswer.trim().toLowerCase();
              isCorrect = await bcrypt.compare(normalized, question.flagAnswer);
              score = isCorrect ? question.points : 0;
              earnedPoints += score;
            }
            break;
          }

          case QuestionType.TEXT:
          case QuestionType.FILE_UPLOAD: {
            isCorrect = null;
            hasManualQuestions = true;
            break;
          }
        }

        return {
          attemptId,
          questionId: question.id,
          selectedOptionId: ans.selectedOptionId ?? null,
          textAnswer: ans.textAnswer ?? null,
          fileKey: ans.fileKey ?? null,
          fileName: ans.fileName ?? null,
          fileSize: ans.fileSize ?? null,
          isCorrect,
          score,
        };
      }),
    );

    await this.prisma.quizAnswer.createMany({
      data: answerCreates.filter(Boolean) as any[],
    });

    const autoTotal = quiz.questions
      .filter(
        (q) =>
          q.type !== QuestionType.TEXT && q.type !== QuestionType.FILE_UPLOAD,
      )
      .reduce((sum, q) => sum + q.points, 0);

    const scorePercent =
      autoTotal > 0 ? Math.round((earnedPoints / autoTotal) * 100) : null;

    const passed =
      scorePercent !== null ? scorePercent >= quiz.passingScore : null;

    const status =
      hasManualQuestions && passed === null
        ? QuizAttemptStatus.COMPLETED
        : passed
          ? QuizAttemptStatus.PASSED
          : QuizAttemptStatus.FAILED;

    const updated = await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        status,
        score: scorePercent,
        passed: passed ?? false,
        submittedAt: new Date(),
      },
      include: {
        answers: {
          include: { question: { select: { type: true, points: true } } },
        },
      },
    });

    return {
      ...updated,
      scorePercent,
      passed,
      passingScore: quiz.passingScore,
      hasManualQuestions,
      message: hasManualQuestions
        ? 'Some answers require manual review by a moderator'
        : passed
          ? `Passed! Score: ${scorePercent}%`
          : `Failed. Score: ${scorePercent}%. Need ${quiz.passingScore}% to pass`,
    };
  }

  // ─── USER: Get my attempts for a quiz ────────────────────────────────────────
  async getMyAttempts(userId: string, quizId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { quizId, userId },
      orderBy: { startedAt: 'desc' },
      include: {
        answers: {
          include: {
            question: {
              select: { text: true, type: true, points: true, order: true },
            },
            selectedOption: { select: { text: true } },
          },
          orderBy: { question: { order: 'asc' } },
        },
      },
    });
  }

  // ─── MODERATOR: Grade manual answers ─────────────────────────────────────────
  async gradeManualAnswer(
    actor: any,
    answerId: string,
    data: { score: number; feedback?: string },
  ) {
    if (actor.role !== Role.MODERATOR && actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    const answer = await this.prisma.quizAnswer.findUnique({
      where: { id: answerId },
      include: { question: true, attempt: { include: { quiz: true } } },
    });
    if (!answer) throw new NotFoundException();

    const maxPoints = answer.question.points;
    if (data.score < 0 || data.score > maxPoints)
      throw new BadRequestException(`Score must be between 0 and ${maxPoints}`);

    const updated = await this.prisma.quizAnswer.update({
      where: { id: answerId },
      data: {
        score: data.score,
        feedback: data.feedback,
        isCorrect: data.score === maxPoints,
      },
    });

    await this.recalculateAttemptScore(answer.attemptId);

    return updated;
  }

  // ─── Internal: Recalculate attempt score after manual grading ────────────────
  private async recalculateAttemptScore(attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: { include: { questions: true } },
        answers: true,
      },
    });
    if (!attempt) return;

    const totalPoints = attempt.quiz.questions.reduce(
      (s, q) => s + q.points,
      0,
    );
    const earnedPoints = attempt.answers.reduce(
      (s, a) => s + (a.score ?? 0),
      0,
    );
    const scorePercent =
      totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

    const passed = scorePercent >= attempt.quiz.passingScore;

    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        score: scorePercent,
        passed,
        status: passed ? QuizAttemptStatus.PASSED : QuizAttemptStatus.FAILED,
      },
    });
  }

  // ─── ADMIN: Get all attempts for a quiz ──────────────────────────────────────
  async getAttempts(actor: any, quizId: string) {
    if (actor.role !== Role.MODERATOR && actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.quizAttempt.findMany({
      where: { quizId },
      orderBy: { startedAt: 'desc' },
      include: {
        user: {
          select: { id: true, displayName: true, username: true, avatar: true },
        },
        answers: {
          include: {
            question: { select: { text: true, type: true, points: true } },
          },
        },
      },
    });
  }

  // ─── Check if user passed quiz (used by lesson unlock logic) ─────────────────
  async hasUserPassed(userId: string, quizId: string): Promise<boolean> {
    const passed = await this.prisma.quizAttempt.findFirst({
      where: { quizId, userId, passed: true },
    });
    return !!passed;
  }
}
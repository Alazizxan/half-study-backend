import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { gradingQueue } from '../grading/grading.queue';
import { SubmissionStatus, Role } from '@prisma/client';

@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: any) {
    const submission = await this.prisma.submission.create({
      data: {
        userId,
        assignmentId: dto.assignmentId,
        textAnswer: dto.textAnswer,
        fileKey: dto.fileKey,
        status: SubmissionStatus.PENDING,
      },
    });

    await gradingQueue.add('gradeSubmission', {
      submissionId: submission.id,
    });

    return submission;
  }

  async getAuditLogs(page = 1) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
    });
  }

  async filter(query: any) {
    return this.prisma.submission.findMany({
      where: {
        status: query.status as SubmissionStatus,
        userId: query.userId,
        assignment: {
          lesson: {
            courseId: query.courseId,
          },
        },
      },
      include: {
        user: true,
        assignment: {
          include: { lesson: true },
        },
      },
    });
  }

  async review(actor: any, id: string, dto: any) {
    if (actor.role !== Role.MODERATOR && actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.submission.update({
      where: { id },
      data: {
        status: dto.status as SubmissionStatus,
        score: dto.score,
        feedback: dto.feedback,
      },
    });
  }

  async bulkReview(actor: any, ids: string[], status: SubmissionStatus) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.MODERATOR)
      throw new ForbiddenException();

    return this.prisma.submission.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }

  async listPending() {
    return this.prisma.submission.findMany({
      where: { status: SubmissionStatus.PENDING },
      include: {
        user: true,
        assignment: true,
      },
    });
  }
}
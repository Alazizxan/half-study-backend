import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { gradingQueue } from '../grading/grading.queue';
import { Query } from '@nestjs/common';





@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService) { }

  async create(userId: string, dto: any) {
    const submission = await this.prisma.submission.create({
      data: {
        userId,
        assignmentId: dto.assignmentId,
        textAnswer: dto.textAnswer,
        fileKey: dto.fileKey,
      },
    });

    // Queue ga job qo‘shamiz
    await gradingQueue.add('gradeSubmission', {
      submissionId: submission.id,
    });

    return submission;
  }


  async filter(query: any) {
    return this.prisma.submission.findMany({
      where: {
        status: query.status,
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
          include: {
            lesson: true,
          },
        },
      },
    });
  }

  async review(actor: any, id: string, dto: any) {
    if (actor.role !== 'MODERATOR' && actor.role !== 'ADMIN')
      throw new ForbiddenException();

    return this.prisma.submission.update({
      where: { id },
      data: {
        status: dto.status,
        score: dto.score,
        feedback: dto.feedback,
      },
    });
  }



  async bulkReview(actor: any, ids: string[], status: string) {
    if (actor.role !== 'ADMIN' && actor.role !== 'MODERATOR')
      throw new ForbiddenException();

    return this.prisma.submission.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }

  async listPending() {
    return this.prisma.submission.findMany({
      where: { status: 'PENDING' },
      include: {
        user: true,
        assignment: true,
      },
    });
  }
}

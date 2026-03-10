import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { SubmissionStatus, Role } from '@prisma/client';
import { gradingQueue } from '../grading/grading.queue';
import {
  CreateSubmissionDto,
  ReviewSubmissionDto,
} from './dto/create-submittion.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private upload: UploadService,
  ) {}

  async create(userId: string, dto: CreateSubmissionDto) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: dto.assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    // Only one submission per assignment per user (or allow revision)
    const existing = await this.prisma.submission.findFirst({
      where: { userId, assignmentId: dto.assignmentId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && existing.status === SubmissionStatus.PENDING) {
      throw new BadRequestException(
        'You have a pending submission. Wait for it to be reviewed.',
      );
    }

    const submission = await this.prisma.submission.create({
      data: {
        userId,
        assignmentId: dto.assignmentId,
        textAnswer: dto.textAnswer,
        fileKey: dto.fileKey,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        status: SubmissionStatus.PENDING,
      },
    });

    // Queue for AI pre-grading (text answers only)
    if (dto.textAnswer && !dto.fileKey) {
      await gradingQueue.add('gradeSubmission', {
        submissionId: submission.id,
      });
    }

    return submission;
  }

  async getMySubmissions(userId: string, assignmentId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { userId, assignmentId },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich file URLs
    return Promise.all(submissions.map((s) => this.upload.enrichWithUrl(s)));
  }

  async listPending() {
    const submissions = await this.prisma.submission.findMany({
      where: { status: SubmissionStatus.PENDING },
      include: {
        user: {
          select: { id: true, displayName: true, username: true, avatar: true },
        },
        assignment: { include: { lesson: { include: { course: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(submissions.map((s) => this.upload.enrichWithUrl(s)));
  }

  async filter(query: any) {
    const submissions = await this.prisma.submission.findMany({
      where: {
        ...(query.status && { status: query.status as SubmissionStatus }),
        ...(query.userId && { userId: query.userId }),
        ...(query.courseId && {
          assignment: { lesson: { courseId: query.courseId } },
        }),
      },
      include: {
        user: {
          select: { id: true, displayName: true, username: true, avatar: true },
        },
        assignment: { include: { lesson: { include: { course: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? parseInt(query.limit) : 50,
      skip: query.page ? (parseInt(query.page) - 1) * (query.limit ?? 50) : 0,
    });
    return Promise.all(submissions.map((s) => this.upload.enrichWithUrl(s)));
  }

  async review(actor: any, id: string, dto: ReviewSubmissionDto) {
    if (actor.role !== Role.MODERATOR && actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    const submission = await this.prisma.submission.findUnique({
      where: { id },
    });
    if (!submission) throw new NotFoundException();

    return this.prisma.submission.update({
      where: { id },
      data: {
        status: dto.status,
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

  async getAuditLogs(page = 1) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
    });
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) { }

  async create(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.course.create({
      data: dto,
    });
  }

  async publish(actor: any, id: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.course.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  async list(page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where: { isPublished: true },
        skip,
        take: pageSize,
        include: { category: true },
      }),
      this.prisma.course.count({
        where: { isPublished: true },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  async enroll(userId: string, courseId: string) {
    return this.prisma.$transaction(async (tx) => {

      const course = await tx.course.findUnique({
        where: { id: courseId },
      });

      if (!course || !course.isPublished)
        throw new NotFoundException('Course not found');

      const existing = await tx.enrollment.findFirst({
        where: { userId, courseId },
      });

      if (existing) {
        // ✅ idempotent: qayta bosilsa ham successdek ishlaydi
        return existing;
      }
      // FREE COURSE
      if (course.priceType === 'FREE') {
        return tx.enrollment.create({
          data: { userId, courseId },
        });
      }

      // COIN COURSE
      if (course.priceType === 'COINS') {

        if (!course.coinPrice)
          throw new ForbiddenException('Invalid course price');

        const balance = await tx.coinEvent.aggregate({
          where: { userId },
          _sum: { amount: true },
        });

        const userBalance = balance._sum.amount || 0;

        if (userBalance < course.coinPrice)
          throw new ForbiddenException('Not enough coins');

        // deduct coins
        await tx.coinEvent.create({
          data: {
            userId,
            amount: -course.coinPrice,
            reason: 'TRANSFER_OUT',
          },
        });

        return tx.enrollment.create({
          data: { userId, courseId },
        });
      }

      throw new ForbiddenException('Unsupported payment type');
    });
  }

  async getBySlug(slug: string, userId: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        lessons: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
        },
        category: true,
      },
    });

    if (!course || !course.isPublished)
      throw new NotFoundException('Course not found');

    // Enrollment check
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: course.id,
        },
      },
    });

    // Agar enroll bo‘lmagan bo‘lsa – unlock va progress hisoblamaymiz
    if (!enrollment) {
      return {
        ...course,
        isEnrolled: false,
        lessons: course.lessons.map((lesson, index) => ({
          ...lesson,
          completed: false,
          isUnlocked: false,
        })),
      };
    }

    // Progresslarni olamiz
    const progressList = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        lesson: {
          courseId: course.id,
        },
      },
    });

    const progressMap = new Map(
      progressList.map(p => [p.lessonId, p.completed])
    );

    // Lessonsni enrich qilamiz
    const enrichedLessons = course.lessons.map((lesson, index) => {
      const completed = !!progressMap.get(lesson.id);

      let isUnlocked = false;

      if (index === 0) {
        isUnlocked = true;
      } else {
        const prevLesson = course.lessons[index - 1];
        isUnlocked = !!progressMap.get(prevLesson.id);
      }

      return {
        ...lesson,
        completed,
        isUnlocked,
      };
    });

    return {
      ...course,
      lessons: enrichedLessons,
      isEnrolled: true,
    };
  }

  async getAnalytics(courseId: string) {
    const [enrollments, reviews] = await Promise.all([
      this.prisma.enrollment.count({ where: { courseId } }),
      this.prisma.courseReview.aggregate({
        where: { courseId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      totalStudents: enrollments,
      avgRating: reviews._avg.rating || 0,
      totalReviews: reviews._count,
    };
  }

  async review(userId: string, courseId: string, dto: any) {
    return this.prisma.courseReview.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: dto,
      create: { userId, courseId, ...dto },
    });
  }

  async getReviews(courseId: string) {
    return this.prisma.courseReview.findMany({
      where: { courseId },
      include: { user: true },
    });
  }
}
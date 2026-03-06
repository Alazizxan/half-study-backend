import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, PriceType, CoinReason } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async create(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    return this.prisma.course.create({ data: dto });
  }

  async publish(actor: any, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();
    return this.prisma.course.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  // ✅ 1) /courses
  async list(page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where: { isPublished: true },
        skip,
        take: pageSize,
        include: {
          category: true,
          lessons: {
            where: { isPublished: true },
            select: { estimatedMin: true },
          },
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.count({
        where: { isPublished: true },
      }),
    ]);

    const items = courses.map((c) => {
      const totalLessons = c.lessons.length;
      const totalDurationMin = c.lessons.reduce(
        (sum, l) => sum + (l.estimatedMin || 0),
        0,
      );

      return {
        id: c.id,
        title: c.title,
        slug: c.slug,
        description: c.description,
        difficulty: c.difficulty,
        priceType: c.priceType,
        coinPrice: c.coinPrice,
        category: c.category,
        coverImage: c.coverImage,

        studentsCount: c._count.enrollments,
        totalLessons,
        totalDurationMin,
        hasCertificate: c.hasCertificate,
      };
    });

    return { items, meta: { page, pageSize, total } };
  }

  // ✅ 2) /courses/:slug
  async getBySlug(slug: string, userId: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        lessons: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            content: true,
            order: true,
            estimatedMin: true,
            videoKey: true,
          },
        },
        category: true,
        _count: { select: { enrollments: true } },
      },
    });

    if (!course || !course.isPublished)
      throw new NotFoundException('Course not found');

    const totalLessons = course.lessons.length;
    const totalDurationMin = course.lessons.reduce(
      (sum, l) => sum + (l.estimatedMin || 0),
      0,
    );

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: course.id } },
    });

    const progressList = enrollment
      ? await this.prisma.lessonProgress.findMany({
          where: { userId, lesson: { courseId: course.id } },
          select: { lessonId: true, completed: true },
        })
      : [];

    const progressMap = new Map(progressList.map((p) => [p.lessonId, p.completed]));

    const lessons = course.lessons.map((lesson, index) => {
      const completed = !!progressMap.get(lesson.id);

      let isUnlocked = false;
      if (!enrollment) {
        isUnlocked = false;
      } else if (index === 0) {
        isUnlocked = true;
      } else {
        const prev = course.lessons[index - 1];
        isUnlocked = !!progressMap.get(prev.id);
      }

      const type: 'VIDEO' | 'TEXT' = lesson.videoKey ? 'VIDEO' : 'TEXT';

      return {
        id: lesson.id,
        title: lesson.title,
        content: lesson.content,
        order: lesson.order,

        type,
        durationMin: lesson.estimatedMin || 0,

        videoKey: lesson.videoKey || null,
        streamUrl: lesson.videoKey ? `/api/v1/lessons/${lesson.id}/stream` : null,

        completed,
        isUnlocked,
      };
    });

    const completedLessons = enrollment
      ? lessons.filter((l) => l.completed).length
      : 0;

    const completionPercent =
      enrollment && totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      coverImage: course.coverImage,
      difficulty: course.difficulty,
      priceType: course.priceType,
      coinPrice: course.coinPrice,
      moneyPrice: course.moneyPrice,
      category: course.category,

      studentsCount: course._count.enrollments,
      totalLessons,
      totalDurationMin,
      hasCertificate: course.hasCertificate,

      isEnrolled: !!enrollment,
      completionPercent,

      lessons,
    };
  }

  // ✅ 3) enroll
  async enroll(userId: string, courseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId } });
      if (!course || !course.isPublished)
        throw new NotFoundException('Course not found');

      const existing = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });

      const getBalance = async () => {
        const agg = await tx.coinEvent.aggregate({
          where: { userId },
          _sum: { amount: true },
        });
        return agg._sum.amount || 0;
      };

      if (existing) {
        return { enrolled: true, newBalance: await getBalance() };
      }

      if (course.priceType === PriceType.FREE) {
        await tx.enrollment.create({ data: { userId, courseId } });
        return { enrolled: true, newBalance: await getBalance() };
      }

      if (course.priceType === PriceType.COINS) {
        if (!course.coinPrice || course.coinPrice <= 0)
          throw new BadRequestException('INVALID_COIN_PRICE');

        const balance = await getBalance();
        if (balance < course.coinPrice) {
          throw new BadRequestException('INSUFFICIENT_COINS');
        }

        await tx.coinEvent.create({
          data: {
            userId,
            amount: -course.coinPrice,
            reason: CoinReason.COURSE_PURCHASE,
          },
        });

        await tx.enrollment.create({ data: { userId, courseId } });

        return { enrolled: true, newBalance: await getBalance() };
      }

      throw new BadRequestException('UNSUPPORTED_PAYMENT_TYPE');
    });
  }

  // ✅ 5) stats
  async getStats(courseId: string) {
    const [studentsCount, reviewsAgg, totalLessons, completedAgg] =
      await Promise.all([
        this.prisma.enrollment.count({ where: { courseId } }),
        this.prisma.courseReview.aggregate({
          where: { courseId },
          _avg: { rating: true },
          _count: true,
        }),
        this.prisma.lesson.count({ where: { courseId, isPublished: true } }),
        this.prisma.lessonProgress.count({
          where: { completed: true, lesson: { courseId } },
        }),
      ]);

    const denom = studentsCount * (totalLessons || 1);
    const completionRate = denom > 0 ? Math.round((completedAgg / denom) * 100) : 0;

    return {
      studentsCount,
      completionRate,
      averageRating: reviewsAgg._avg.rating || 0,
    };
  }

  // ✅ 6) certificate
  async getCertificate(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { isPublished: true, hasCertificate: true },
    });

    if (!course || !course.isPublished)
      throw new NotFoundException('Course not found');

    if (!course.hasCertificate) return { available: false };

    const totalLessons = await this.prisma.lesson.count({
      where: { courseId, isPublished: true },
    });
    if (totalLessons === 0) return { available: false };

    const completedLessons = await this.prisma.lessonProgress.count({
      where: { userId, completed: true, lesson: { courseId } },
    });

    const percent = Math.round((completedLessons / totalLessons) * 100);
    if (percent < 100) return { available: false };

    return {
      available: true,
      downloadUrl: `/api/v1/courses/${courseId}/certificate/download`,
    };
  }

  // ✅ 7) course progress (contract: percent/completedLessons/totalLessons/nextLessonId)
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
      return { percent: 0, completedLessons: 0, totalLessons: 0, nextLessonId: null };
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

    const completedSet = new Set(progresses.filter((p) => p.completed).map((p) => p.lessonId));
    const completedLessons = completedSet.size;

    const percent =
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    let nextLessonId: string | null = null;
    for (let i = 0; i < lessons.length; i++) {
      const id = lessons[i].id;
      const done = completedSet.has(id);

      if (i === 0) {
        if (!done) { nextLessonId = id; break; }
      } else {
        const prevId = lessons[i - 1].id;
        if (completedSet.has(prevId) && !done) { nextLessonId = id; break; }
      }
    }

    return { percent, completedLessons, totalLessons, nextLessonId };
  }

  // ===== existing analytics/review =====
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
      orderBy: { createdAt: 'desc' },
    });
  }
}
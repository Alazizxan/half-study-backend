import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType, Role } from '@prisma/client';
import { gradingQueue } from '../grading/grading.queue'; // reuse redis connection
import { Queue } from 'bullmq';
import { redis } from '../../common/config/redis.config';

const notificationQueue = new Queue('notifications', {
  connection: redis,
});

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({
        where: { userId },
      }),
    ]);

    const unread = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return {
      data,
      meta: { total, page, pageSize, unread },
    };
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async broadcast(actor: any, dto: any) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException();

    await notificationQueue.add('broadcast', dto);

    return { message: 'Broadcast queued' };
  }
}

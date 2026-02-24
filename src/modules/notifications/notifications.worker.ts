import { Worker } from 'bullmq';
import { redis } from '../../common/config/redis.config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    if (job.name === 'broadcast') {
      const users = await prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: job.data.type,
            title: job.data.title,
            body: job.data.body,
            link: job.data.link,
          },
        });
      }
    }
  },
  { connection: redis },
);
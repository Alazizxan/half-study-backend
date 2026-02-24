import { Worker } from 'bullmq';
import { redis } from '../../common/config/redis.config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let gradingWorker: Worker | null = null;

// ❗ Test muhitda worker ishlamasin
if (process.env.NODE_ENV !== 'test') {
  gradingWorker = new Worker(
    'grading',
    async (job) => {
      if (job.name === 'gradeSubmission') {
        const { submissionId } = job.data;

        const submission = await prisma.submission.findUnique({
          where: { id: submissionId },
          include: { assignment: true },
        });

        if (!submission) return;

        const score = Math.floor(
          Math.random() * submission.assignment.maxScore,
        );

        const feedback = 'AI auto-graded submission';

        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            score,
            feedback,
            status: 'AI_GRADED',
          },
        });
      }
    },
    {
      connection: redis,
    },
  );
}

export { gradingWorker };
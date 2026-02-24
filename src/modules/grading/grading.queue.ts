import { Queue } from 'bullmq';
import { redis } from '../../common/config/redis.config';

export const gradingQueue = new Queue('grading', {
  connection: redis,
});
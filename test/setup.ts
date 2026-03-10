import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  return app;
}

export async function cleanDatabase(app: INestApplication) {
  const prisma = app.get(PrismaService);

  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.submission.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.lessonProgress.deleteMany(),
    prisma.coinEvent.deleteMany(),
    prisma.xpEvent.deleteMany(),
    prisma.wallet.deleteMany(),
    prisma.lesson.deleteMany(),
    prisma.course.deleteMany(),
    prisma.category.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

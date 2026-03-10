import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { LessonUnlockService } from './lesson-unlock.service';
import { VideoProcessor } from './video.processor';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'video' })],
  controllers: [LessonsController],
  providers: [LessonsService, LessonUnlockService, VideoProcessor],
  exports: [LessonsService, LessonUnlockService],
})
export class LessonsModule {}

import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { LessonsModule } from '../lessons/lessons.module';



@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  imports: [LessonsModule],
})
export class SubmissionsModule {}

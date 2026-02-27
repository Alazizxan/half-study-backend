import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { GamificationModule } from '../gamification/gamification.module';


@Module({
  imports: [GamificationModule],
  controllers: [ProgressController],
  providers: [ProgressService]
})
export class ProgressModule {}

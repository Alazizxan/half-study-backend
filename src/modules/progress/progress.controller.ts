import {
  Controller,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private progress: ProgressService) {}

  @Post('lesson/:lessonId/complete')
  complete(
    @CurrentUser() user: any,
    @Param('lessonId') lessonId: string,
  ) {
    return this.progress.completeLesson(
      user.sub,
      lessonId,
    );
  }
}
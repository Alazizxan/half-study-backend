import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { CreateQuizDto, UpdateQuizDto, SubmitQuizDto } from './dto/quiz.dto';

@Controller('api/v1/quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuizController {
  constructor(private quizService: QuizService) {}

  // ── ADMIN ───────────────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() actor: any, @Body() dto: CreateQuizDto) {
    return this.quizService.create(actor, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() actor: any,
    @Param('id') id: string,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizService.update(actor, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  delete(@CurrentUser() actor: any, @Param('id') id: string) {
    return this.quizService.delete(actor, id);
  }

  // Admin: get quiz with correct answers
  @Get(':id/admin')
  @Roles(Role.ADMIN, Role.MODERATOR)
  getAdmin(@Param('id') id: string) {
    return this.quizService.getById(id, true);
  }

  // Admin/Mod: get all attempts for a quiz
  @Get(':id/attempts')
  @Roles(Role.ADMIN, Role.MODERATOR)
  getAttempts(@CurrentUser() actor: any, @Param('id') id: string) {
    return this.quizService.getAttempts(actor, id);
  }

  // Mod: grade a manual answer (TEXT / FILE_UPLOAD)
  @Patch('answers/:answerId/grade')
  @Roles(Role.ADMIN, Role.MODERATOR)
  gradeAnswer(
    @CurrentUser() actor: any,
    @Param('answerId') answerId: string,
    @Body() body: { score: number; feedback?: string },
  ) {
    return this.quizService.gradeManualAnswer(actor, answerId, body);
  }

  // ── STUDENT ─────────────────────────────────────────────────────────────────

  // Get quiz for a lesson (no correct answers exposed)
  @Get('lesson/:lessonId')
  getByLesson(@CurrentUser() user: any, @Param('lessonId') lessonId: string) {
    return this.quizService.getByLesson(lessonId, user.sub);
  }

  // Start a new attempt
  @Post(':id/attempt')
  startAttempt(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quizService.startAttempt(user.sub, id);
  }

  // Submit answers
  @Post('attempt/:attemptId/submit')
  submitAttempt(
    @CurrentUser() user: any,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quizService.submitAttempt(user.sub, attemptId, dto);
  }

  // My attempts history
  @Get(':id/my-attempts')
  myAttempts(@CurrentUser() user: any, @Param('id') id: string) {
    return this.quizService.getMyAttempts(user.sub, id);
  }
}

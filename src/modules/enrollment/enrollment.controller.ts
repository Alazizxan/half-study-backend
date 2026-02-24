import {
  Controller,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/enrollment')
@UseGuards(JwtAuthGuard)
export class EnrollmentController {
  constructor(private enrollment: EnrollmentService) {}

  @Post(':courseId')
  enroll(
    @CurrentUser() user: any,
    @Param('courseId') courseId: string,
  ) {
    return this.enrollment.enroll(user.sub, courseId);
  }
}
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Controller('api/v1/assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private assignments: AssignmentsService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(
    @CurrentUser() actor: any,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(actor, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.assignments.getById(id);
  }

  @Get('lesson/:lessonId')
  listByLesson(@Param('lessonId') lessonId: string) {
    return this.assignments.listByLesson(lessonId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() actor: any,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignments.update(actor, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  delete(@CurrentUser() actor: any, @Param('id') id: string) {
    return this.assignments.delete(actor, id);
  }
}
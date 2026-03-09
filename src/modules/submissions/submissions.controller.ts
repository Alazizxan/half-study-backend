// ─── submissions/submissions.controller.ts ───────────────────────────────────
import {
  Controller, Post, Get, Patch,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { SubmissionStatus, Role } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSubmissionDto, ReviewSubmissionDto } from './dto/create-submittion.dto';
import { SubmissionsService } from './submissions.service';

@Controller('api/v1/submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionsController {
  constructor(
    private submissions: SubmissionsService,
    private prisma: PrismaService,
  ) {}

  // Student: submit assignment
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateSubmissionDto) {
    return this.submissions.create(user.sub, dto);
  }

  // Student: get my submissions for an assignment
  @Get('my/:assignmentId')
  getMy(
    @CurrentUser() user: any,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.submissions.getMySubmissions(user.sub, assignmentId);
  }

  // Mod/Admin: pending list
  @Get('pending')
  @Roles(Role.MODERATOR, Role.ADMIN)
  listPending() {
    return this.submissions.listPending();
  }

  // Mod/Admin: filter
  @Get()
  @Roles(Role.MODERATOR, Role.ADMIN)
  filter(@Query() query: any) {
    return this.submissions.filter(query);
  }

  // Mod/Admin: review single
  @Patch(':id/review')
  @Roles(Role.MODERATOR, Role.ADMIN)
  review(
    @CurrentUser() actor: any,
    @Param('id') id: string,
    @Body() dto: ReviewSubmissionDto,
  ) {
    return this.submissions.review(actor, id, dto);
  }

  // Admin: bulk status change
  @Post('bulk-review')
  @Roles(Role.MODERATOR, Role.ADMIN)
  bulk(
    @CurrentUser() actor: any,
    @Body() body: { ids: string[]; status: SubmissionStatus },
  ) {
    return this.submissions.bulkReview(actor, body.ids, body.status);
  }

  // Admin: audit logs
  @Get('audit')
  @Roles(Role.ADMIN)
  async audit(@Query('page') page = 1) {
    return this.submissions.getAuditLogs(+page);
  }
}

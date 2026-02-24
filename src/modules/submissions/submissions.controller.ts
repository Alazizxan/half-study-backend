import { Controller } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Body, Post, Get, Patch, Param } from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { ForbiddenException } from '@nestjs/common';
import { SubmissionStatus, Role } from '@prisma/client';
import { Query } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';


@Controller('api/v1/submissions')
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private submissions: SubmissionsService,
    private prisma: PrismaService,
  ) { }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: any,
  ) {
    return this.submissions.create(user.sub, dto);
  }

  @Get('pending')
  @Roles('MODERATOR', 'ADMIN')
  listPending() {
    return this.submissions.listPending();
  }

  @Get()
  @Roles(Role.MODERATOR, Role.ADMIN)
  filter(@Query() query: any) {
    return this.submissions.filter(query);
  }


  @Post('bulk-review')
  @Roles(Role.MODERATOR, Role.ADMIN)
  bulk(
    @CurrentUser() actor: any,
    @Body() body: { ids: string[]; status: SubmissionStatus },
  ) {
    return this.submissions.bulkReview(actor, body.ids, body.status);
  }

  @Get('audit')
  @Roles(Role.ADMIN)
  async audit(@Query('page') page = 1) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 20,
      take: 20,
    });
  }

  @Patch(':id/review')
  review(
    @CurrentUser() actor: any,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.submissions.review(actor, id, dto);
  }
}
import type { Express, Response } from 'express';
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Controller('api/v1/lessons')
@UseGuards(JwtAuthGuard) // ✅ studentlar uchun 100% ochiq (faqat login shart)
export class LessonsController {
  constructor(private lessons: LessonsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(
    @CurrentUser() actor: any,
    @Body() dto: CreateLessonDto,
  ) {
    return this.lessons.create(actor, dto);
  }

  // ✅ 8) LESSON DETAIL (student uchun)
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.lessons.getLessonDetail(id, user.sub);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() actor: any,
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.lessons.update(actor, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  delete(
    @CurrentUser() actor: any,
    @Param('id') id: string,
  ) {
    return this.lessons.delete(actor, id);
  }

  @Patch(':id/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  publish(
    @CurrentUser() actor: any,
    @Param('id') id: string,
  ) {
    return this.lessons.publish(actor, id);
  }

  // ✅ ADMIN VIDEO UPLOAD
  @Post(':id/video')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { dest: '/tmp' }))
  uploadLessonVideo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.lessons.processVideo(id, file.path);
  }

  // ✅ USER STREAM ENDPOINT (enrollment check LessonsService ichida)
  @Get(':id/stream')
  streamLesson(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    return this.lessons.streamLesson(id, user.sub, res);
  }
}
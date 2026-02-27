import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCourseDto } from './dto/create-course.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('api/v1/courses')
export class CoursesController {
  constructor(private courses: CoursesService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(@CurrentUser() actor: any, @Body() dto: CreateCourseDto) {
    return this.courses.create(actor, dto);
  }

  @Get()
  list(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
  ) {
    return this.courses.list(Number(page), Number(pageSize));
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.courses.getBySlug(slug);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/publish')
  publish(@CurrentUser() actor: any, @Param('id') id: string) {
    return this.courses.publish(actor, id);
  }


  @Get(':id/analytics')
  @Roles(Role.ADMIN)
  getAnalytics(@Param('id') id: string) {
    return this.courses.getAnalytics(id);
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard)
  review(
    @Param('id') courseId: string,
    @CurrentUser() user: any,
    @Body() dto: { rating: number; comment?: string },
  ) {
    return this.courses.review(user.sub, courseId, dto);
  }

  @Get(':id/reviews')
  getReviews(@Param('id') id: string) {
    return this.courses.getReviews(id);
  }
}
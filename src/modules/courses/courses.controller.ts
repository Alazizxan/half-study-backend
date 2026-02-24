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

@Controller('api/v1/courses')
export class CoursesController {
  constructor(private courses: CoursesService) {}

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
}
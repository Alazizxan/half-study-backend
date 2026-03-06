import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
  Res,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCourseDto } from './dto/create-course.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CertificateService } from './certificate.service';
import * as crypto from "crypto";
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('api/v1/courses')
export class CoursesController {
  constructor(
    private courses: CoursesService,
    private certificateService: CertificateService,
    private prisma: PrismaService,
  ) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(@CurrentUser() actor: any, @Body() dto: CreateCourseDto) {
    return this.courses.create(actor, dto);
  }

  // ✅ 1) PUBLIC: /courses
  @Get()
  list(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
  ) {
    return this.courses.list(Number(page), Number(pageSize));
  }

  // ✅ 5) PUBLIC: /courses/:id/stats
  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.courses.getStats(id);
  }

  // ✅ 3) AUTH: /courses/:id/enroll
  @UseGuards(JwtAuthGuard)
  @Post(':id/enroll')
  enroll(@Param('id') courseId: string, @CurrentUser() user: any) {
    return this.courses.enroll(user.sub, courseId);
  }

  // ✅ 6) AUTH: /courses/:id/certificate (availability)
  @UseGuards(JwtAuthGuard)
  @Get(':id/certificate')
  certificate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.courses.getCertificate(user.sub, id);
  }

  // ✅ 6) AUTH: /courses/:id/certificate/download (REAL PDF DOWNLOAD)
  @UseGuards(JwtAuthGuard)
  @Get(':id/certificate/download')
  async downloadCertificate(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {

    const certCheck = await this.courses.getCertificate(user.sub, id);


    if (!certCheck?.available) {
      throw new ForbiddenException("CERTIFICATE_NOT_AVAILABLE");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        username: true,
        displayName: true
      }
    });

    if (!dbUser) {
      throw new NotFoundException("User not found");
    }
    console.log(dbUser);

    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { lessons: true }
    });

    if (!course) {
      throw new NotFoundException("Course not found");
    }

    let cert = await this.prisma.certificate.findFirst({
      where: {
        userId: user.sub,
        courseId: id
      }
    });

    if (!cert) {

      cert = await this.prisma.certificate.create({
        data: {
          code: crypto.randomUUID().slice(0, 8).toUpperCase(),
          userId: user.sub,
          courseId: id
        }
      });

    }

    const verifyUrl =
      `https://half-study.xandev.org/verify/${cert.code}`;

    const pdf = await this.certificateService.generate({

      studentName: dbUser.displayName || dbUser.username,

      courseTitle: course.title,

      lessonCount: course.lessons.length,

      difficulty: course.difficulty,

      courseType: course.priceType === "FREE" ? "FREE" : "PAID",

      certificateId: cert.code,

      date: new Date(cert.issuedAt).toLocaleDateString(),

      verifyUrl

    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="certificate-${cert.code}.pdf"`
    );

    res.send(pdf);
  }

  // ✅ 7) AUTH: /courses/slug/:slug/progress  (regexsiz, conflict 0%)
  @UseGuards(JwtAuthGuard)
  @Get('slug/:slug/progress')
  progress(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.courses.getCourseProgress(user.sub, slug);
  }

  // ✅ 2) AUTH: /courses/slug/:slug (regexsiz, conflict 0%)
  @UseGuards(JwtAuthGuard)
  @Get('slug/:slug')
  get(@Param('slug') slug: string, @CurrentUser() user: any) {
    return this.courses.getBySlug(slug, user.sub);
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

  @UseGuards(JwtAuthGuard)
  @Post(':id/review')
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
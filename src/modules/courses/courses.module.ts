import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CertificateService } from './certificate.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService, CertificateService, PrismaService],
})
export class CoursesModule {}

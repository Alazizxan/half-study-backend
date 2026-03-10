import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/v1/certificates')
export class CertificatesController {
  constructor(private prisma: PrismaService) {}

  @Get('verify/:code')
  async verify(@Param('code') code: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { code },
      include: {
        user: true,
        course: true,
      },
    });

    if (!cert) {
      return { valid: false };
    }

    return {
      valid: true,

      student: cert.user.displayName,

      course: cert.course.title,

      issuedAt: cert.issuedAt,
    };
  }
}

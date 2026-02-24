import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async updateProfile(userId: string, dto: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
  }

  async changeRole(actor: any, targetId: string, role: Role) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.user.update({
      where: { id: targetId },
      data: { role },
    });
  }

  async banUser(actor: any, targetId: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.user.update({
      where: { id: targetId },
      data: {
        lockedUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      },
    });
  }

  async unbanUser(actor: any, targetId: string) {
    if (actor.role !== Role.ADMIN)
      throw new ForbiddenException();

    return this.prisma.user.update({
      where: { id: targetId },
      data: { lockedUntil: null },
    });
  }
}
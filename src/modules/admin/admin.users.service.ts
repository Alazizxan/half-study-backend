// src/modules/admin/admin-users.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) { }

  async listUsers(page = 1, pageSize = 30, search?: string) {
    const where = search
      ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { displayName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
      : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, username: true, email: true, displayName: true,
          role: true, xp: true, level: true, createdAt: true,
          lockedUntil: true, isEmailVerified: true,
          wallet: { select: { id: true } },
          _count: { select: { enrollments: true, referrals: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);


    const userIds = users.map((u) => u.id);

    const balances = userIds.length
      ? await this.prisma.coinEvent.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _sum: { amount: true },
      })
      : [];

    const balanceMap = new Map(
      balances.map((b) => [b.userId, b._sum.amount ?? 0]),
    );

    const items = users.map((u) => ({
      ...u,
      balance: balanceMap.get(u.id) ?? 0,
    }));

    return { items, meta: { page, pageSize, total } };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        enrollments: { include: { course: { select: { title: true } } } },
        coinEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
        achievements: { include: { achievement: true } },
        _count: {
          select: { enrollments: true, referrals: true, submissions: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const balance = await this.prisma.coinEvent.aggregate({
      where: { userId: id },
      _sum: { amount: true },
    });

    return { ...user, balance: balance._sum.amount ?? 0 };
  }

  async changeRole(userId: string, role: Role) {
    await this._findOrThrow(userId);
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async banUser(userId: string, hours?: number) {
    await this._findOrThrow(userId);
    const lockedUntil = hours
      ? new Date(Date.now() + hours * 3_600_000)
      : new Date('9999-12-31');
    return this.prisma.user.update({ where: { id: userId }, data: { lockedUntil } });
  }

  async unbanUser(userId: string) {
    await this._findOrThrow(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: null, failedAttempts: 0 },
    });
  }

  async adjustCoins(userId: string, amount: number, reason: string) {
    await this._findOrThrow(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.coinEvent.create({
        data: { userId, amount, reason: reason as any },
      });
      const agg = await tx.coinEvent.aggregate({
        where: { userId },
        _sum: { amount: true },
      });
      return { newBalance: agg._sum.amount ?? 0 };
    });
  }

  private async _findOrThrow(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }
}
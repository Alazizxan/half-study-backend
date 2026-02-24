import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CoinReason, AuditAction } from '@prisma/client';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
    const sum = await this.prisma.coinEvent.aggregate({
      where: { userId },
      _sum: { amount: true },
    });

    return { balance: sum._sum.amount || 0 };
  }

  async transfer(fromUserId: string, dto: any) {
    if (fromUserId === dto.toUserId)
      throw new BadRequestException('Cannot transfer to yourself');

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ Target mavjudmi
      const target = await tx.user.findUnique({
        where: { id: dto.toUserId },
      });

      if (!target)
        throw new BadRequestException('Target user not found');

      // 2️⃣ Balance check
      const balanceAgg = await tx.coinEvent.aggregate({
        where: { userId: fromUserId },
        _sum: { amount: true },
      });

      const balance = balanceAgg._sum.amount || 0;

      if (balance < dto.amount)
        throw new ForbiddenException('Insufficient balance');

      // 3️⃣ Daily limit (1000 coin)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayTransfers = await tx.coinEvent.aggregate({
        where: {
          userId: fromUserId,
          reason: CoinReason.TRANSFER_OUT,
          createdAt: { gte: todayStart },
        },
        _sum: { amount: true },
      });

      const transferredToday =
        Math.abs(todayTransfers._sum.amount || 0);

      if (transferredToday + dto.amount > 1000)
        throw new ForbiddenException(
          'Daily transfer limit exceeded',
        );

      // 4️⃣ Ledger OUT
      await tx.coinEvent.create({
        data: {
          userId: fromUserId,
          amount: -dto.amount,
          reason: CoinReason.TRANSFER_OUT,
        },
      });

      // 5️⃣ Ledger IN
      await tx.coinEvent.create({
        data: {
          userId: dto.toUserId,
          amount: dto.amount,
          reason: CoinReason.TRANSFER_IN,
        },
      });

      // 6️⃣ Audit log
      await tx.auditLog.create({
        data: {
          action: AuditAction.COIN_TRANSFER,
          actorId: fromUserId,
          targetId: dto.toUserId,
          meta: {
            amount: dto.amount,
          },
        },
      });

      return { message: 'Transfer successful' };
    });
  }
}
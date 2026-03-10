import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CoinReason, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PromoService {
  constructor(private prisma: PrismaService) {}

  async createPromo(
    actor: any,
    dto: {
      code: string;
      coins: number;
      maxUses?: number | null;
      expiresAt?: string | null;
    },
  ) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    const code = String(dto.code || '')
      .trim()
      .toUpperCase();
    const coins = Number(dto.coins);

    if (!code) {
      throw new BadRequestException('INVALID_CODE');
    }

    if (!Number.isInteger(coins) || coins <= 0) {
      throw new BadRequestException('INVALID_COINS');
    }

    const maxUses =
      dto.maxUses === undefined || dto.maxUses === null
        ? null
        : Number(dto.maxUses);

    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      throw new BadRequestException('INVALID_MAX_USES');
    }

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      const parsed = new Date(dto.expiresAt);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException('INVALID_EXPIRES_AT');
      }
      expiresAt = parsed;
    }

    const exists = await this.prisma.promoCode.findUnique({
      where: { code },
    });

    if (exists) {
      throw new BadRequestException('PROMO_CODE_ALREADY_EXISTS');
    }

    return this.prisma.promoCode.create({
      data: {
        code,
        coins,
        maxUses,
        expiresAt,
        createdBy: actor.sub,
      },
    });
  }

  async redeemPromo(userId: string, dto: { code: string }) {
    const code = String(dto.code || '')
      .trim()
      .toUpperCase();

    if (!code) {
      throw new BadRequestException('INVALID_CODE');
    }

    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({
        where: { code },
      });

      if (!promo) {
        throw new NotFoundException('PROMO_NOT_FOUND');
      }

      if (promo.expiresAt && new Date() > new Date(promo.expiresAt)) {
        throw new BadRequestException('PROMO_EXPIRED');
      }

      if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
        throw new BadRequestException('PROMO_MAX_USES_REACHED');
      }

      const alreadyUsed = await tx.promoCodeUse.findUnique({
        where: {
          userId_promoId: {
            userId,
            promoId: promo.id,
          },
        },
      });

      if (alreadyUsed) {
        throw new BadRequestException('PROMO_ALREADY_USED');
      }

      await tx.promoCodeUse.create({
        data: {
          userId,
          promoId: promo.id,
        },
      });

      await tx.promoCode.update({
        where: { id: promo.id },
        data: {
          usedCount: { increment: 1 },
        },
      });

      await tx.coinEvent.create({
        data: {
          userId,
          amount: promo.coins,
          reason: CoinReason.PURCHASE,
        },
      });

      const balanceAgg = await tx.coinEvent.aggregate({
        where: { userId },
        _sum: { amount: true },
      });

      return {
        redeemed: true,
        code: promo.code,
        coinsAdded: promo.coins,
        newBalance: balanceAgg._sum.amount || 0,
      };
    });
  }

  async listPromos(actor: any, page = 1, pageSize = 20) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.promoCode.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promoCode.count(),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  async getMyPromoUses(userId: string) {
    return this.prisma.promoCodeUse.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        promo: true,
      },
    });
  }
}

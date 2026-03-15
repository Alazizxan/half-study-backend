import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CoinReason,
  NotificationType,
  PurchaseStatus,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

const COIN_PACKS: Record<number, number> = {
  25: 150000,
  50: 290000,
  150: 800000,
};

const PAY_TO_CARD = '8600 1234 5678 9012';

// Windows local dev: ./receipts  |  Production Linux: /var/www/receipts
const RECEIPT_DIR = process.env.RECEIPT_DIR
  ? path.resolve(process.env.RECEIPT_DIR)
  : path.join(process.cwd(), 'receipts');

const CUSTOM_PRICE_PER_COIN_UZS = 6000;

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
      const target = await tx.user.findUnique({ where: { id: dto.toUserId } });
      if (!target) throw new BadRequestException('Target user not found');

      const balanceAgg = await tx.coinEvent.aggregate({
        where: { userId: fromUserId },
        _sum: { amount: true },
      });
      const balance = balanceAgg._sum.amount || 0;
      if (balance < dto.amount)
        throw new ForbiddenException('Insufficient balance');

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

      const transferredToday = Math.abs(todayTransfers._sum.amount || 0);
      if (transferredToday + dto.amount > 1000)
        throw new ForbiddenException('Daily transfer limit exceeded');

      await tx.coinEvent.create({
        data: { userId: fromUserId, amount: -dto.amount, reason: CoinReason.TRANSFER_OUT },
      });
      await tx.coinEvent.create({
        data: { userId: dto.toUserId, amount: dto.amount, reason: CoinReason.TRANSFER_IN },
      });
      await tx.auditLog.create({
        data: {
          action: AuditAction.COIN_TRANSFER,
          actorId: fromUserId,
          targetId: dto.toUserId,
          meta: { amount: dto.amount },
        },
      });

      return { message: 'Transfer successful' };
    });
  }

  // ================= PURCHASE REQUEST FLOW =================

  private maskCard(cardNumber: string) {
    const digits = (cardNumber || '').replace(/\D/g, '');
    if (digits.length < 12) throw new BadRequestException('INVALID_CARD');
    const last4 = digits.slice(-4);
    return `${digits.slice(0, 4)} **** **** ${last4}`;
  }

  private calcAmountUzs(coins: number) {
    if (COIN_PACKS[coins]) return COIN_PACKS[coins];
    if (!Number.isFinite(coins) || coins <= 0)
      throw new BadRequestException('INVALID_COINS');
    if (!Number.isInteger(coins))
      throw new BadRequestException('COINS_MUST_BE_INTEGER');
    return coins * CUSTOM_PRICE_PER_COIN_UZS;
  }

  async createPurchaseRequest(
    userId: string,
    dto: { coins: number; cardNumber: string },
  ) {
    const coins = Number(dto?.coins);
    if (!Number.isFinite(coins) || coins <= 0)
      throw new BadRequestException('INVALID_COINS');

    const amountUzs  = this.calcAmountUzs(coins);
    const cardMasked = this.maskCard(dto?.cardNumber);
    const expiresAt  = new Date(Date.now() + 30 * 60 * 1000);

    const active = await this.prisma.coinPurchaseRequest.findFirst({
      where: {
        userId,
        status: {
          in: [
            PurchaseStatus.PENDING,
            PurchaseStatus.AWAITING_RECEIPT,
            PurchaseStatus.UNDER_REVIEW,
          ],
        },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (active) {
      return {
        id: active.id,
        status: active.status,
        coins: active.coins,
        amountUzs: active.amountUzs,
        expiresAt: active.expiresAt,
        payToCard: PAY_TO_CARD,
      };
    }

    const req = await this.prisma.coinPurchaseRequest.create({
      data: {
        userId,
        coins,
        amountUzs,
        cardMasked,
        status: PurchaseStatus.AWAITING_RECEIPT,
        expiresAt,
      },
    });

    return {
      id: req.id,
      status: req.status,
      coins: req.coins,
      amountUzs: req.amountUzs,
      expiresAt: req.expiresAt,
      payToCard: PAY_TO_CARD,
    };
  }

  async uploadReceipt(
    userId: string,
    requestId: string,
    tempPath: string,
    originalName: string,
  ) {
    const req = await this.prisma.coinPurchaseRequest.findUnique({
      where: { id: requestId },
    });

    if (!req || req.userId !== userId)
      throw new NotFoundException('REQUEST_NOT_FOUND');

    if (new Date() > new Date(req.expiresAt)) {
      await this.prisma.coinPurchaseRequest.update({
        where: { id: requestId },
        data: { status: PurchaseStatus.EXPIRED },
      });
      throw new BadRequestException('REQUEST_EXPIRED');
    }

    if (
      req.status !== PurchaseStatus.AWAITING_RECEIPT &&
      req.status !== PurchaseStatus.PENDING
    ) {
      throw new BadRequestException('INVALID_STATUS');
    }

    if (!fs.existsSync(RECEIPT_DIR)) {
      fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    }

    const safeName = `${requestId}-${Date.now()}-${path
      .basename(originalName)
      .replace(/\s+/g, '_')}`;

    const dest = path.join(RECEIPT_DIR, safeName);
    fs.renameSync(tempPath, dest);

    // ← YAGONA O'ZGARISH: dest o'rniga safeName (faqat filename)
    await this.prisma.coinPurchaseRequest.update({
      where: { id: requestId },
      data: {
        receiptFileKey: safeName,
        status: PurchaseStatus.UNDER_REVIEW,
      },
    });

    return { ok: true, status: PurchaseStatus.UNDER_REVIEW };
  }

  async listMyPurchaseRequests(userId: string) {
    const items = await this.prisma.coinPurchaseRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return items.map((x) => ({
      id: x.id,
      coins: x.coins,
      amountUzs: x.amountUzs,
      status: x.status,
      expiresAt: x.expiresAt,
      cardMasked: x.cardMasked,
      payToCard: PAY_TO_CARD,
      hasReceipt: !!x.receiptFileKey,
      adminNote: x.adminNote || null,
      createdAt: x.createdAt,
    }));
  }

  async adminListPurchaseRequests(status?: string, page = 1, pageSize = 20) {
    const skip  = (page - 1) * pageSize;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coinPurchaseRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              phone: true,
              displayName: true,
            },
          },
        },
      }),
      this.prisma.coinPurchaseRequest.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  async approvePurchaseRequest(
    adminId: string,
    requestId: string,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.coinPurchaseRequest.findUnique({
        where: { id: requestId },
      });

      if (!req) throw new NotFoundException('REQUEST_NOT_FOUND');

      // Idempotent — allaqachon approved
      if (req.status === PurchaseStatus.APPROVED) {
        const bal = await tx.coinEvent.aggregate({
          where: { userId: req.userId },
          _sum: { amount: true },
        });
        return { approved: true, newBalance: bal._sum.amount || 0 };
      }

      // ← O'ZGARISH: expired tekshiruvi olib tashlandi
      // Admin istalgan vaqtda (EXPIRED, UNDER_REVIEW, AWAITING_RECEIPT) approve qila oladi
      // Faqat REJECTED ni bloklash
      if (req.status === PurchaseStatus.REJECTED) {
        throw new BadRequestException('ALREADY_REJECTED');
      }

      await tx.coinEvent.create({
        data: {
          userId: req.userId,
          amount: req.coins,
          reason: CoinReason.PURCHASE,
        },
      });

      await tx.coinPurchaseRequest.update({
        where: { id: requestId },
        data: {
          status: PurchaseStatus.APPROVED,
          reviewedById: adminId,
          reviewedAt: new Date(),
          adminNote: note || null,
        },
      });

      await tx.notification.create({
        data: {
          userId: req.userId,
          type: NotificationType.SYSTEM,
          title: 'Coins added',
          body: `${req.coins} coin balansingizga qo'shildi.`,
          link: '/wallet',
        },
      });

      const bal = await tx.coinEvent.aggregate({
        where: { userId: req.userId },
        _sum: { amount: true },
      });

      return { approved: true, newBalance: bal._sum.amount || 0 };
    });
  }

  async rejectPurchaseRequest(
    adminId: string,
    requestId: string,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.coinPurchaseRequest.findUnique({
        where: { id: requestId },
      });

      if (!req) throw new NotFoundException('REQUEST_NOT_FOUND');

      await tx.coinPurchaseRequest.update({
        where: { id: requestId },
        data: {
          status: PurchaseStatus.REJECTED,
          reviewedById: adminId,
          reviewedAt: new Date(),
          adminNote: note || 'Rejected',
        },
      });

      await tx.notification.create({
        data: {
          userId: req.userId,
          type: NotificationType.SYSTEM,
          title: 'Purchase rejected',
          body: `To'lov rad etildi: ${note || "Sabab ko'rsatilmagan"}`,
          link: '/wallet',
        },
      });

      return { rejected: true };
    });
  }

  async getTransactions(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coinEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.coinEvent.count({ where: { userId } }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }
}
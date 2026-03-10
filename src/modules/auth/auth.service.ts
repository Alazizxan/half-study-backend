import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { AchievementService } from '../gamification/achievement.service';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

interface JwtPayload {
  sub: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private achievementService: AchievementService,
  ) {}

  async register(dto: any) {
    const hash = await argon2.hash(dto.password);

    let referredById: string | undefined;

    if (dto.referralCode) {
      const refUser = await this.prisma.user.findUnique({
        where: { referralCode: dto.referralCode },
      });

      if (refUser) {
        referredById = refUser.id;
      }
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          displayName: dto.username,
          passwordHash: hash,
          referralCode: nanoid(),
          referredById,
        },
      });

      if (referredById) {
        await this.prisma.coinEvent.create({
          data: {
            userId: referredById,
            amount: 10,
            reason: 'REFERRAL',
          },
        });
      }

      return user;
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new BadRequestException('EMAIL_OR_USERNAME_EXISTS');
      }

      throw e;
    }
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException();

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedException();

    return user;
  }

  async login(user: any) {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
    };

    const access = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET as string,
      expiresIn: process.env.JWT_ACCESS_EXPIRES as any,
    });

    const refresh = this.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET as string,
      expiresIn: process.env.JWT_REFRESH_EXPIRES as any,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await argon2.hash(refresh),
      },
    });

    // 🔥 STREAK SYSTEM

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) return { access, refresh };

    if (!dbUser.lastLoginAt) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          currentStreak: 1,
          longestStreak: 1,
          lastLoginAt: today,
        },
      });

      await this.achievementService.unlock(user.id, 'First Login');
    } else {
      const last = new Date(dbUser.lastLoginAt);

      if (last.toDateString() === yesterday.toDateString()) {
        const newStreak = dbUser.currentStreak + 1;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            currentStreak: newStreak,
            longestStreak: Math.max(newStreak, dbUser.longestStreak),
            lastLoginAt: today,
          },
        });

        if (newStreak === 7) {
          await this.achievementService.unlock(user.id, '7 Day Streak');
        }
      } else if (last.toDateString() !== today.toDateString()) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            currentStreak: 1,
            lastLoginAt: today,
          },
        });
      }
    }

    return { access, refresh };
  }
}

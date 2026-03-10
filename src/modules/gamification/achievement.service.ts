import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { XpService } from './xp.service';

@Injectable()
export class AchievementService {
  constructor(
    private prisma: PrismaService,
    private xpService: XpService,
  ) {}

  async unlock(userId: string, title: string) {
    const achievement = await this.prisma.achievement.findFirst({
      where: { title },
    });

    if (!achievement) return;

    try {
      await this.prisma.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id,
        },
      });

      await this.xpService.addXp(userId, achievement.xpReward);
    } catch {
      // already unlocked — ignore
    }
  }
}

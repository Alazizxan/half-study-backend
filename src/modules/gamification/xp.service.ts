import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class XpService {
  constructor(private prisma: PrismaService) {}

  async addXp(userId: string, amount: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) return;

    const newXp = user.xp + amount;

    // LEVEL FORMULA
    const newLevel = Math.floor(Math.sqrt(newXp / 1000)) + 1;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        xp: newXp,
        level: newLevel,
      },
    });

    return { xp: newXp, level: newLevel };
  }
}

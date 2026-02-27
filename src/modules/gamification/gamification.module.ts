import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AchievementService } from './achievement.service';
import { XpService } from './xp.service';

@Module({
    providers: [PrismaService, XpService, AchievementService],
    exports: [XpService, AchievementService],
})
export class GamificationModule { }
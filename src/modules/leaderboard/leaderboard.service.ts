// src/modules/leaderboard/leaderboard.service.ts

import { Injectable, OnModuleInit, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UserTitle }     from "@prisma/client";

/* ─── Rank score formula weights ─────────────────────────────────────────── */
const W = {
  xp:               1.0,
  coursesCompleted: 300,
  lessonsCompleted: 20,
  assignmentsDone:  15,
  quizPassRate:     5,
  longestStreak:    10,
  referralCount:    50,
  coinsEarned:      0.5,
};

/* ─── Title thresholds ────────────────────────────────────────────────────── */
function computeTitle(s: {
  xp:               number;
  coursesCompleted: number;
  quizPassRate:     number;
  longestStreak:    number;
  referralCount:    number;
  rank:             number;
}): UserTitle {
  if (s.rank <= 3)                                      return UserTitle.LEGEND;
  if (s.referralCount >= 10)                            return UserTitle.AMBASSADOR;
  if (s.longestStreak >= 14)                            return UserTitle.RELENTLESS;
  if (s.coursesCompleted >= 3 && s.xp >= 500)          return UserTitle.PRO;
  if (s.quizPassRate >= 85    && s.xp >= 200)           return UserTitle.HIGH_IQ;
  if (s.xp >= 50)                                       return UserTitle.APPRENTICE;
  return UserTitle.NEWCOMER;
}

@Injectable()
export class LeaderboardService implements OnModuleInit {
  private readonly logger = new Logger(LeaderboardService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    setTimeout(() => this.rebuildStats(), 5_000);
    this.interval = setInterval(() => this.rebuildStats(), 60 * 60 * 1_000);
  }

  /* ── core rebuild ───────────────────────────────────────────────────────── */
  async rebuildStats() {
    this.logger.log("Rebuilding leaderboard stats…");

    const users = await this.prisma.user.findMany({
      select: {
        id: true, xp: true, level: true,
        currentStreak: true, longestStreak: true,
        referrals:    { select: { id: true } },
        coinEvents:   { select: { amount: true } },
        progress:     { select: { completed: true } },
        submissions:  { select: { id: true } },
        quizAttempts: { select: { passed: true } },
      },
    });

    const raw = users.map((u) => {
      const lessonsCompleted = u.progress.filter((p) => p.completed).length;
      const assignmentsDone  = u.submissions.length;
      const quizzesTaken     = u.quizAttempts.length;
      const quizzesPassed    = u.quizAttempts.filter((a) => a.passed).length;
      const quizPassRate     = quizzesTaken > 0 ? (quizzesPassed / quizzesTaken) * 100 : 0;
      const referralCount    = u.referrals.length;
      const coinsEarned      = u.coinEvents
        .filter((c) => c.amount > 0)
        .reduce((s, c) => s + c.amount, 0);
      const coursesCompleted = Math.floor(u.xp / 500);

      const rankScore =
        u.xp               * W.xp +
        coursesCompleted   * W.coursesCompleted +
        lessonsCompleted   * W.lessonsCompleted +
        assignmentsDone    * W.assignmentsDone +
        quizPassRate       * W.quizPassRate +
        u.longestStreak    * W.longestStreak +
        referralCount      * W.referralCount +
        coinsEarned        * W.coinsEarned;

      return {
        id: u.id,
        xp: u.xp,
        level: u.level,
        coursesCompleted,
        lessonsCompleted,
        assignmentsDone,
        quizzesTaken,
        quizzesPassed,
        quizPassRate:  Math.round(quizPassRate * 10) / 10,
        currentStreak: u.currentStreak,
        longestStreak: u.longestStreak,
        referralCount,
        coinsEarned,
        rankScore,
      };
    });

    raw.sort((a, b) => b.rankScore - a.rankScore);

    await Promise.all(
      raw.map((s, idx) => {
        const { id, ...data } = s;
        const title = computeTitle({ ...s, rank: idx + 1 });
        return this.prisma.userStats.upsert({
          where:  { userId: id },
          create: { userId: id, ...data, title },
          update: { ...data, title },
        });
      })
    );

    this.logger.log(`Leaderboard rebuilt — ${raw.length} users processed`);
  }

  /* ── GET top N ──────────────────────────────────────────────────────────── */
  async getTop(limit = 100) {
    const rows = await this.prisma.userStats.findMany({
      orderBy: { rankScore: "desc" },
      take:    limit,
      include: {
        user: {
          select: {
            id: true, username: true, displayName: true,
            avatar: true, level: true,
          },
        },
      },
    });

    return rows.map((r, i) => ({
      rank:             i + 1,
      userId:           r.user.id,
      username:         r.user.username,
      displayName:      r.user.displayName,
      avatar:           r.user.avatar,
      level:            r.user.level,
      title:            r.title,
      xp:               r.xp,
      rankScore:        Math.round(r.rankScore),
      coursesCompleted: r.coursesCompleted,
      lessonsCompleted: r.lessonsCompleted,
      quizPassRate:     r.quizPassRate,
      longestStreak:    r.longestStreak,
      referralCount:    r.referralCount,
    }));
  }

  /* ── GET user rank ──────────────────────────────────────────────────────── */
  async getUserRank(userId: string) {
    // 1. userStats yo'q bo'lsa — real-time hisoblash
    let stats = await this.prisma.userStats.findUnique({ where: { userId } });

    if (!stats) {
      // User mavjudligini tekshir
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException("User not found");

      // Stats yo'q = yangi user, rebuild trigger qilib, keyin qayta olish
      await this.rebuildStats();
      stats = await this.prisma.userStats.findUnique({ where: { userId } });

      // Rebuild dan keyin ham yo'q bo'lsa — default qaytaramiz
      if (!stats) {
        return {
          rank:             null,
          userId,
          xp:               0,
          level:            1,
          title:            UserTitle.NEWCOMER,
          coursesCompleted: 0,
          lessonsCompleted: 0,
          quizPassRate:     0,
          longestStreak:    0,
          referralCount:    0,
          rankScore:        0,
        };
      }
    }

    const above = await this.prisma.userStats.count({
      where: { rankScore: { gt: stats.rankScore } },
    });

    const rank = above + 1;
    const title = computeTitle({
      xp:               stats.xp,
      coursesCompleted: stats.coursesCompleted,
      quizPassRate:     stats.quizPassRate,
      longestStreak:    stats.longestStreak,
      referralCount:    stats.referralCount,
      rank,
    });

    return {
      rank,
      userId:           stats.userId,
      xp:               stats.xp,
      level:            stats.level,
      title,
      rankScore:        Math.round(stats.rankScore),
      coursesCompleted: stats.coursesCompleted,
      lessonsCompleted: stats.lessonsCompleted,
      quizPassRate:     stats.quizPassRate,
      longestStreak:    stats.longestStreak,
      referralCount:    stats.referralCount,
    };
  }

  /* ── Manual admin trigger ───────────────────────────────────────────────── */
  async triggerRebuild() {
    await this.rebuildStats();
    return { ok: true };
  }
}
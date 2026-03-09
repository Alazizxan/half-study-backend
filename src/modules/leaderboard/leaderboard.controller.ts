// src/leaderboard/leaderboard.controller.ts

import { Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { LeaderboardService } from "./leaderboard.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import * as client from "@prisma/client";

@Controller("api/v1/leaderboard")
export class LeaderboardController {
  constructor(private svc: LeaderboardService) { }

  /** GET /leaderboard?limit=100  — public */
  @Get()
  getTop(@Query("limit") limit?: string) {
    return this.svc.getTop(Math.min(Number(limit) || 100, 200));
  }

  /** GET /leaderboard/me  — current user's rank */
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async getMe(@CurrentUser() user: any) {
    const result = await this.svc.getUserRank(user.sub);
    return { data: result };
  }

  /** POST /leaderboard/rebuild  — admin only */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post("rebuild")
  rebuild() {
    return this.svc.triggerRebuild();
  }
}

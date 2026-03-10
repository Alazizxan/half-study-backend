// src/modules/admin/admin-users.controller.ts

import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AdminUsersService } from './admin.users.service';
import { JwtAuthGuard }      from '../../common/guards/jwt-auth.guard';
import { RolesGuard }        from '../../common/guards/roles.guard';
import { Roles }             from '../../common/decorators/roles.decorator';
import { Role }              from '@prisma/client';

@Controller('api/v1/admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private users: AdminUsersService) {}

  /** GET /admin/users?page=1&pageSize=30&search= */
  @Get()
  list(
    @Query('page',     new DefaultValuePipe(1),  ParseIntPipe) page:     number,
    @Query('pageSize', new DefaultValuePipe(30), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    return this.users.listUsers(page, pageSize, search);
  }

  /** GET /admin/users/:id */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.getUser(id);
  }

  /**
   * PATCH /admin/users/:id/role
   * body: { role: "ADMIN" | "MODERATOR" | "STUDENT" }
   */
  @Patch(':id/role')
  changeRole(@Param('id') id: string, @Body('role') role: Role) {
    return this.users.changeRole(id, role);
  }

  /**
   * POST /admin/users/:id/ban
   * body: { hours?: number }   omitted = permanent
   */
  @Post(':id/ban')
  ban(@Param('id') id: string, @Body('hours') hours?: number) {
    return this.users.banUser(id, hours);
  }

  /** POST /admin/users/:id/unban */
  @Post(':id/unban')
  unban(@Param('id') id: string) {
    return this.users.unbanUser(id);
  }

  /**
   * POST /admin/users/:id/coins
   * body: { amount: number, reason?: string }
   * amount musbat = qo'shish, manfiy = ayirish
   */
  @Post(':id/coins')
  adjustCoins(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('reason') reason?: string,
  ) {
    return this.users.adjustCoins(id, amount, reason ?? 'ADMIN_ADJUSTMENT');
  }
}
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PromoService } from './promo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('api/v1/promo')
@UseGuards(JwtAuthGuard)
export class PromoController {
  constructor(private promo: PromoService) {}

  // ✅ USER: redeem
  @Post('redeem')
  redeem(@CurrentUser() user: any, @Body() dto: { code: string }) {
    return this.promo.redeemPromo(user.sub, dto);
  }

  // ✅ USER: own promo use history
  @Get('me/uses')
  myUses(@CurrentUser() user: any) {
    return this.promo.getMyPromoUses(user.sub);
  }

  // ✅ ADMIN: create promo
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(
    @CurrentUser() actor: any,
    @Body()
    dto: {
      code: string;
      coins: number;
      maxUses?: number | null;
      expiresAt?: string | null;
    },
  ) {
    return this.promo.createPromo(actor, dto);
  }

  // ✅ ADMIN: list promos
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  list(
    @CurrentUser() actor: any,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.promo.listPromos(actor, Number(page), Number(pageSize));
  }
}

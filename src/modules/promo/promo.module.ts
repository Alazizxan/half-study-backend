import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PromoController } from './promo.controller';
import { PromoService } from './promo.service';

@Module({
  controllers: [PromoController],
  providers: [PromoService, PrismaService],
  exports: [PromoService],
})
export class PromoModule {}
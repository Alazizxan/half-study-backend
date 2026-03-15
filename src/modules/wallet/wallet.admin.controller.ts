import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('api/v1/wallet/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WalletAdminController {
  constructor(private prisma: PrismaService) {}

  @Get('purchase-requests/:id/receipt')
  async downloadReceipt(@Param('id') id: string, @Res() res: Response) {
    const req = await this.prisma.coinPurchaseRequest.findUnique({
      where: { id },
      select: {
        id: true,
        receiptFileKey: true,
      },
    });

    if (!req || !req.receiptFileKey) {
      throw new NotFoundException('RECEIPT_NOT_FOUND');
    }

    const filePath = req.receiptFileKey;

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('RECEIPT_FILE_MISSING');
    }

    const filename = path.basename(filePath);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);


    res.setHeader('Content-Type', 'application/octet-stream');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}

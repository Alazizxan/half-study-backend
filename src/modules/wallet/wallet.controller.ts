import type { Express } from 'express';
import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransferDto } from './dto/transfer.dto';

import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('api/v1/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private wallet: WalletService) { }

  @Get()
  balance(@CurrentUser() user: any) {
    return this.wallet.getBalance(user.sub);
  }

  @Post('transfer')
  transfer(@CurrentUser() user: any, @Body() dto: TransferDto) {
    return this.wallet.transfer(user.sub, dto);
  }

  // ✅ NEW: create purchase request (25/50/150 yoki custom)
  @Post('purchase-requests')
  createPurchaseRequest(
    @CurrentUser() user: any,
    @Body() dto: { coins: number; cardNumber: string },
  ) {
    return this.wallet.createPurchaseRequest(user.sub, dto);
  }

  // ✅ NEW: upload receipt (chek)
  @Post('purchase-requests/:id/receipt')
  @UseInterceptors(FileInterceptor('file', { dest: '/tmp' }))
  uploadReceipt(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.wallet.uploadReceipt(
      user.sub,
      id,
      file.path,
      file.originalname,
    );
  }

  // ✅ NEW: user requests list
  @Get('purchase-requests/me')
  myRequests(@CurrentUser() user: any) {
    return this.wallet.listMyPurchaseRequests(user.sub);
  }

  // ================= ADMIN =================

  @Get('admin/purchase-requests')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  adminList(
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.wallet.adminListPurchaseRequests(
      status,
      Number(page),
      Number(pageSize),
    );
  }

  @Post('admin/purchase-requests/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  approve(
    @CurrentUser() admin: any,
    @Param('id') id: string,
    @Body() dto: { note?: string },
  ) {
    return this.wallet.approvePurchaseRequest(admin.sub, id, dto?.note);
  }

  @Post('admin/purchase-requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  reject(
    @CurrentUser() admin: any,
    @Param('id') id: string,
    @Body() dto: { note?: string },
  ) {
    return this.wallet.rejectPurchaseRequest(admin.sub, id, dto?.note);
  }


  @Get('transactions')
  transactions(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.wallet.getTransactions(user.sub, Number(page), Number(pageSize));
  }
}
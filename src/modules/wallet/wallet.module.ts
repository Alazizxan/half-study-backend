import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletAdminController } from './wallet.admin.controller';

@Module({
  controllers: [WalletController, WalletAdminController],
  providers: [WalletService],
})
export class WalletModule {}

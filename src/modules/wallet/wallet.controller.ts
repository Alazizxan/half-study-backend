import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransferDto } from './dto/transfer.dto';

@Controller('api/v1/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private wallet: WalletService) {}

  @Get()
  balance(@CurrentUser() user: any) {
    return this.wallet.getBalance(user.sub);
  }

  @Post('transfer')
  transfer(
    @CurrentUser() user: any,
    @Body() dto: TransferDto,
  ) {
    return this.wallet.transfer(user.sub, dto);
  }
}
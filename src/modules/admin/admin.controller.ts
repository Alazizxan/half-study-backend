import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private admin: AdminService) { }

  @Get('dashboard')
  @Roles(Role.ADMIN)
  dashboard(@CurrentUser() actor: any) {
    return this.admin.dashboard(actor);
  }

  @Post('broadcast')
  @Roles(Role.ADMIN)
  broadcast(@Body() dto: { title: string; body: string }) {
    return this.admin.broadcast(dto);
  }

  @Get('revenue')
  @Roles(Role.ADMIN)
  revenue() {
    return this.admin.revenue();
  }

  @Post('refund')
  @Roles(Role.ADMIN)
  refund(@Body() dto: { userId: string; courseId: string }) {
    return this.admin.refund(dto);
  }
}
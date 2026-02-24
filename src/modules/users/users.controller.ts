import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.users.getProfile(user.sub);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  changeRole(
    @CurrentUser() actor: any,
    @Param('id') id: string,
    @Body('role') role: Role,
  ) {
    return this.users.changeRole(actor, id, role);
  }

  @Patch(':id/ban')
  @Roles(Role.ADMIN)
  ban(@CurrentUser() actor: any, @Param('id') id: string) {
    return this.users.banUser(actor, id);
  }

  @Patch(':id/unban')
  @Roles(Role.ADMIN)
  unban(@CurrentUser() actor: any, @Param('id') id: string) {
    return this.users.unbanUser(actor, id);
  }
}
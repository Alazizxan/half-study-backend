import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) { }

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

  @Get('me/stats')
  getStats(@CurrentUser() user: any) {
    return this.users.getStats(user.sub);
  }

  @Get('search')
  @Public()
  searchUsers(@Query('q') q: string) {
    return this.users.searchUsers(q);
  }


  @Get('me/achievements')
  getAchievements(@CurrentUser() user: any) {
    return this.users.getAchievements(user.sub);
  }

  @Get('me/courses')
  getMyCourses(@CurrentUser() user: any) {
    return this.users.getMyCourses(user.sub);
  }


  @Get("me/referrals")
  getReferrals(@CurrentUser() user: any) {
    return this.users.getReferralStats(user.sub)
  }
}
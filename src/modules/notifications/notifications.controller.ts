import {
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role, NotificationType } from '@prisma/client';

@Controller('api/v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
  ) {
    return this.notifications.list(user.sub, Number(page), Number(pageSize));
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notifications.markRead(user.sub, id);
  }

  @Post('broadcast')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  broadcast(
    @CurrentUser() actor: any,
    @Body()
    body: {
      type: NotificationType;
      title: string;
      body: string;
      link?: string;
    },
  ) {
    return this.notifications.broadcast(actor, body);
  }
}

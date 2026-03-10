// src/modules/admin/admin.module.ts

import { Module }                 from '@nestjs/common';
import { BullModule }             from '@nestjs/bull';

import { PrismaModule }           from '../../prisma/prisma.module';

import { AdminController }        from './admin.controller';
import { AdminService }           from './admin.service';

import { AdminContentController } from './admin.content.controller';
import { AdminContentService }    from './admin.content.service';

import { AdminUsersController }   from './admin.users.controller';
import { AdminUsersService }      from './admin.users.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'video' }),
  ],
  controllers: [
    AdminController,
    AdminContentController,
    AdminUsersController,
  ],
  providers: [
    AdminService,
    AdminContentService,
    AdminUsersService,
  ],
})
export class AdminModule {}
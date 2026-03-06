import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersMeController } from './users.me.controller';


@Module({
  providers: [UsersService],
  controllers: [UsersController, UsersMeController],
})
export class UsersModule {}
import {
  Body,
  Controller,
  Post,
  Res
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private auth: AuthService) { }

  @Post('register')
  async register(@Body() dto: any) {
    return { data: await this.auth.register(dto) };
  }


  @Throttle(5, 60_000)
  @Post('login')
  async login(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.validateUser(
      body.email,
      body.password,
    );

    const tokens = await this.auth.login(user);

    res.cookie('access_token', tokens.access, {
      httpOnly: true,
      secure: false,
    });

    res.cookie('refresh_token', tokens.refresh, {
      httpOnly: true,
      secure: false,
    });

    return { data: { message: 'Logged in' } };
  }
}
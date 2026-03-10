import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import './modules/grading/grading.worker';
import './modules/notifications/notifications.worker';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.getHttpAdapter().getInstance().set('etag', false);

  app.use(helmet({
    // useStaticAssets uchun crossOriginResourcePolicy o'chirish kerak
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.enableCors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  });

  app.use(cookieParser());

  // ── Static files: /uploads/covers/xxx.jpg → ./uploads/covers/xxx.jpg
  const uploadRoot = process.env.UPLOAD_ROOT
    ? path.resolve(process.env.UPLOAD_ROOT)
    : path.join(process.cwd(), 'uploads');

  ['covers', 'pending', 'videos'].forEach(sub => {
    const dir = path.join(uploadRoot, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  app.useStaticAssets(uploadRoot, {
    prefix: '/uploads',
    setHeaders: (res: any) => res.setHeader('Cache-Control', 'public, max-age=86400'),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Ethical Hacking API')
    .setDescription('Gamified Learning Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.APP_PORT || 3000);
}
bootstrap();
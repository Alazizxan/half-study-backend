import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { CoursesModule } from './modules/courses/courses.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { ProgressModule } from './modules/progress/progress.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { UploadModule } from './modules/upload/upload.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    AuditModule,
    CoursesModule,
    LessonsModule,
    ProgressModule,
    WalletModule,
    AssignmentsModule,
    SubmissionsModule,
    EnrollmentModule,
    UploadModule,
    NotificationsModule,
    

    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
        },
      },
    }),

    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: 100,
    }]),

    PrismaModule,

    AuthModule,

    UsersModule,

    AuditModule,

    CoursesModule,

    LessonsModule,

    ProgressModule,

    WalletModule,

    AssignmentsModule,

    SubmissionsModule,

    EnrollmentModule,

    UploadModule,

    NotificationsModule,

    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
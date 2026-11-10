import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { WinstonLoggerService } from './common/services/winston-logger.service';
import { LoggingMiddleware } from './common/middlewares/logging.middleware';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { WaModule } from './wa/wa.module';
import { EmailModule } from './email/email.module';
import { ContactsModule } from './contacts/contacts.module';
import { AdminModule } from './admin/admin.module';
import { PaymentModule } from './payment/payment.module';
import { AiModule } from './ai/ai.module';
import { CloudinaryService } from './common/services/cloudinary.service';
import { MediaController } from './media/media.controller';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      // Load .env.{NODE_ENV} first, then fall back to plain .env
      // In Docker, environment variables are injected directly so no file is needed.
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env',
      ],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    UserModule,
    AuthModule,
    WaModule,
    EmailModule,
    ContactsModule,
    AdminModule,
    PaymentModule,
    AiModule,
  ],
  controllers: [AppController, MediaController],
  providers: [AppService, WinstonLoggerService, CloudinaryService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}

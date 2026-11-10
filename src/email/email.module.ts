import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { GoogleEmailService } from './google.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GmailReadService } from './gmail-read.service';
import { GmailWebhookController } from './gmail-webhook.controller';

@Module({
  imports: [PrismaModule],
  providers: [EmailService, GoogleEmailService, GmailReadService],
  controllers: [EmailController, GmailWebhookController],
  exports: [GoogleEmailService, EmailService, GmailReadService],
})
export class EmailModule {}

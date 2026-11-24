import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { DokuService } from './doku.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [PaymentService, DokuService],
  exports: [PaymentService],
})
export class PaymentModule {}

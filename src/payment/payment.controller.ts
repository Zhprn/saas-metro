import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import {
  CreateOrderDto,
  CreateOrderSchema,
  PaymentNotificationDto,
} from './dto/payment.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { User } from 'src/common/decorators/user.decorator';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // Public: Get available packages with client key
  @Get('packages')
  async getPackages() {
    return this.paymentService.getPackages();
  }

  // User: Create payment order
  @Post('create-order')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async createOrder(
    @User() user: any,
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto,
  ) {
    return this.paymentService.createOrder(user.id, dto);
  }

  // Webhook: Midtrans notification (no auth)
  @Post('notification')
  async handleNotification(@Body() notification: PaymentNotificationDto) {
    return this.paymentService.handleNotification(notification);
  }

  // User: Get payment history
  @Get('history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getPaymentHistory(@User() user: any) {
    return this.paymentService.getPaymentHistory(user.id);
  }

  // User: Get active subscription
  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getActiveSubscription(@User() user: any) {
    return this.paymentService.getActiveSubscription(user.id);
  }

  // User: Check payment status
  @Get('status/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async checkPaymentStatus(@Param('orderId') orderId: string) {
    return this.paymentService.checkPaymentStatus(orderId);
  }
}

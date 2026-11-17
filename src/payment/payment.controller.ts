import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PaymentService } from './payment.service';
import { DanaService } from './dana.service';
import { CreateOrderDto, CreateOrderSchema } from './dto/payment.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { User } from 'src/common/decorators/user.decorator';

@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly danaService: DanaService,
  ) {}

  // Public: Get available packages
  @Get('packages')
  async getPackages() {
    return this.paymentService.getPackages();
  }

  // User: Create payment order, returns DANA checkout redirectUrl
  @Post('create-order')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async createOrder(
    @User() user: any,
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto,
  ) {
    return this.paymentService.createOrder(user.id, dto);
  }

  // Webhook: DANA finish notification (no auth, verified by X-SIGNATURE).
  // Uses @Res so the global TransformInterceptor doesn't wrap the body:
  // DANA expects exactly { responseCode, responseMessage }.
  @Post('notification')
  async handleNotification(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);
    const path = req.originalUrl.split('?')[0];

    let notify;
    try {
      notify = this.danaService.parseWebhook(
        req.method,
        path,
        req.headers as Record<string, string>,
        rawBody,
      );
    } catch (error) {
      this.logger.warn(`Rejected DANA webhook: ${(error as Error).message}`);
      return res.status(HttpStatus.UNAUTHORIZED).json({
        responseCode: '4015600',
        responseMessage: 'Unauthorized. Invalid Signature',
      });
    }

    try {
      const result = await this.paymentService.handleDanaNotification(notify);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      this.logger.error('Failed to process DANA webhook', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        responseCode: '5005601',
        responseMessage: 'Internal Server Error',
      });
    }
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

  // User: Check payment status with DANA and sync to database
  @Get('status/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async checkPaymentStatus(
    @User() user: any,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentService.checkPaymentStatus(user.id, orderId);
  }
}

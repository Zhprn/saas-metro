import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { PaymentService } from './payment.service';
import {
  PaymentQueryDto,
  PaymentQuerySchema,
  UpdatePaymentDto,
  UpdatePaymentSchema,
} from './dto/payment-query.dto';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ==================== PAYMENT MANAGEMENT ====================

  @Get('payments')
  async findAllPayments(
    @Query(new ZodValidationPipe(PaymentQuerySchema)) query: PaymentQueryDto,
  ) {
    return this.paymentService.findAllPayments(query);
  }

  @Get('payments/export')
  async exportPayments(
    @Query(new ZodValidationPipe(PaymentQuerySchema)) query: PaymentQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.paymentService.exportPaymentsToExcel(query);
    const fileName = `payments_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(buffer);
  }

  @Get('payments/:id')
  async findPaymentById(@Param('id') id: string) {
    return this.paymentService.findPaymentById(id);
  }

  @Patch('payments/:id')
  async updatePayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePaymentSchema)) dto: UpdatePaymentDto,
  ) {
    return this.paymentService.updatePayment(id, dto);
  }

  @Delete('payments/:id')
  async deletePayment(@Param('id') id: string) {
    return this.paymentService.deletePayment(id);
  }
}

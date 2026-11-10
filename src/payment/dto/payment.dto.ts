import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const CreateOrderSchema = z.object({
  packageId: z.string().min(1),
});

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}

export const PaymentNotificationSchema = z.object({
  transaction_status: z.string(),
  order_id: z.string(),
  gross_amount: z.string(),
  payment_type: z.string().optional(),
  transaction_id: z.string().optional(),
  fraud_status: z.string().optional(),
  status_code: z.string().optional(),
});

export class PaymentNotificationDto extends createZodDto(
  PaymentNotificationSchema,
) {}

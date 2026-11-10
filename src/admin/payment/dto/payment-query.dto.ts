import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const PaymentQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  // Filter by payment status
  status: z
    .enum(['all', 'paid', 'pending', 'failed'])
    .optional()
    .default('all'),
  // Date range filter (payment date)
  startDate: z.string().optional(), // YYYY-MM-DD
  endDate: z.string().optional(), // YYYY-MM-DD
  // Sorting
  sortBy: z
    .enum(['orderId', 'createdAt', 'paymentMethod', 'status'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export class PaymentQueryDto extends createZodDto(PaymentQuerySchema) {}

// DTO for updating payment status
export const UpdatePaymentSchema = z.object({
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'EXPIRED']),
});

export class UpdatePaymentDto extends createZodDto(UpdatePaymentSchema) {}

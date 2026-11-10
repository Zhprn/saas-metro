import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const UserQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  // Filter by subscription status
  status: z.enum(['all', 'active', 'inactive']).optional().default('all'),
  // Date range filter (sign-up date)
  startDate: z.string().optional(), // YYYY-MM-DD
  endDate: z.string().optional(), // YYYY-MM-DD
  // Sorting
  sortBy: z
    .enum(['id', 'email', 'createdAt', 'planType'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export class UserQueryDto extends createZodDto(UserQuerySchema) {}

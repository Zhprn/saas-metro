import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  telephone: z.string().optional(),
});

export class UpdateAdminUserDto extends createZodDto(UpdateUserSchema) {}

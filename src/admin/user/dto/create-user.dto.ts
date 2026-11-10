import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['USER', 'ADMIN']).optional().default('USER'),
  telephone: z.string().optional(),
});

export class CreateAdminUserDto extends createZodDto(CreateUserSchema) {}

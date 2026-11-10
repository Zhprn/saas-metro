import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  telephone: z.string().optional(),
  picture: z.string().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}

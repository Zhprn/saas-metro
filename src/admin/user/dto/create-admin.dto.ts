import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const CreateAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export class CreateAdminDto extends createZodDto(CreateAdminSchema) {}

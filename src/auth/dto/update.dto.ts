import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const UpdateSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'Name must be at least 3 characters' })
    .optional(),
  email: z.string().email({ message: 'Invalid email address' }).optional(),
});

export class UpdateDto extends createZodDto(UpdateSchema) {}

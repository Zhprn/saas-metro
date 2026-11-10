import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const EmailStatusSchema = z.enum(['ACTIVE', 'BOUNCED', 'UNSUBSCRIBED']);

export const CreateEmailContactSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).optional(),
  status: EmailStatusSchema.optional(),
});

export class CreateEmailContactDto extends createZodDto(
  CreateEmailContactSchema,
) {}

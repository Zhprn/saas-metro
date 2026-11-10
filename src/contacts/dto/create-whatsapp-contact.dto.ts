import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const WhatsAppStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'UNKNOWN']);

export const CreateWhatsAppContactSchema = z.object({
  phone: z.string().trim().min(6),
  name: z.string().trim().min(1).optional(),
  status: WhatsAppStatusSchema.optional(),
  source: z.string().trim().max(50).optional(),
});

export class CreateWhatsAppContactDto extends createZodDto(
  CreateWhatsAppContactSchema,
) {}

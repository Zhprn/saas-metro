import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';
import { CreateWhatsAppContactSchema } from './create-whatsapp-contact.dto';

export const UpdateWhatsAppContactSchema =
  CreateWhatsAppContactSchema.partial().superRefine((value, ctx) => {
    if (!Object.values(value).some((v) => v !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      });
    }
  });

export class UpdateWhatsAppContactDto extends createZodDto(
  UpdateWhatsAppContactSchema,
) {}

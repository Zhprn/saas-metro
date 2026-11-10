import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';
import { CreateEmailContactSchema } from './create-email-contact.dto';

export const UpdateEmailContactSchema =
  CreateEmailContactSchema.partial().superRefine((value, ctx) => {
    if (!Object.values(value).some((v) => v !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      });
    }
  });

export class UpdateEmailContactDto extends createZodDto(
  UpdateEmailContactSchema,
) {}

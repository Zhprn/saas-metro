import { z } from 'zod';
import { createZodDto } from '@anatine/zod-nestjs';

const ManualRecipientSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const EmailBroadcastSchema = z
  .object({
    fromEmail: z.string().email(),
    subject: z.string().min(1),
    html: z.string().min(1),
    recipients: z.array(ManualRecipientSchema).min(1).optional(),
    contactIds: z.array(z.string().min(1)).optional(),
    useAllContacts: z.boolean().optional().default(false),
    delayMs: z.number().int().min(0).default(1000),
    jitterMs: z.number().int().min(0).default(400),
  })
  .superRefine((val, ctx) => {
    const manualCount = val.recipients?.length ?? 0;
    const contactCount = val.contactIds?.length ?? 0;
    const useAll = val.useAllContacts ?? false;

    if (manualCount === 0 && contactCount === 0 && !useAll) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide manual recipients, select contact IDs, or set useAllContacts',
        path: ['recipients'],
      });
    }
  });

export class EmailBroadcastDto extends createZodDto(EmailBroadcastSchema) {}

import { z } from 'zod';
import { createZodDto } from '@anatine/zod-nestjs';

/** Callback query from Google OAuth */
export const ConnectSchema = z.object({
  code: z.string(),
  state: z.string(),
});

/** Quick single-email test DTO */
export const SendTestSchema = z.object({
  fromEmail: z.string().email(),
  toEmail: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});
export class SendTestDto extends createZodDto(SendTestSchema) {}

/** Broadcast DTO */
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

/** Build a minimal HTML MIME email for Gmail raw send */
export function buildMime(
  from: string,
  to: string,
  subject: string,
  html: string,
) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n');
}

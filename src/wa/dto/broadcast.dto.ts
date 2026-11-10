import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

const PhoneRecipientSchema = z.string().min(6);

const AutomationFieldsSchema = z.object({
  name: z.string().optional(),
  isScheduled: z.boolean().optional().default(false),
  scheduleType: z
    .enum(['SEND_NOW', 'SCHEDULE_LATER'])
    .optional()
    .default('SEND_NOW'),
  timetableRepeater: z
    .enum(['ONCE', 'EVERY_DAY', 'EVERY_WEEK', 'EVERY_MONTH'])
    .optional(),
  scheduledDate: z.string().optional(), // 'YYYY-MM-DD'
  scheduledTime: z.string().optional(), // 'HH:mm'
});

export const BroadcastTextSchema = z
  .object({
    recipients: z.array(PhoneRecipientSchema).min(1).optional(),
    contactIds: z.array(z.string().min(1)).optional(),
    useAllContacts: z.boolean().optional().default(false),
    text: z.string().min(1),
    delayMs: z.number().int().min(0).default(1000),
    jitterMs: z.number().int().min(0).default(500),
    checkNumber: z.boolean().default(true),
  })
  .merge(AutomationFieldsSchema)
  .superRefine((val, ctx) => {
    const manualCount = val.recipients?.length ?? 0;
    const contactCount = val.contactIds?.length ?? 0;
    if (manualCount === 0 && contactCount === 0 && !val.useAllContacts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide manual recipients, select contact IDs, or set useAllContacts',
        path: ['recipients'],
      });
    }

    if (val.isScheduled) {
      if (!val.timetableRepeater) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Missing timetableRepeater for scheduled campaign',
          path: ['timetableRepeater'],
        });
      }
      if (!val.scheduledTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Missing scheduledTime',
          path: ['scheduledTime'],
        });
      }
      if (
        val.timetableRepeater === 'ONCE' ||
        val.timetableRepeater === 'EVERY_WEEK' ||
        val.timetableRepeater === 'EVERY_MONTH'
      ) {
        if (!val.scheduledDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Missing scheduledDate for given repeater',
            path: ['scheduledDate'],
          });
        }
      }
    }
  });

export class BroadcastTextDto extends createZodDto(BroadcastTextSchema) {}

export const BroadcastImageSchema = z
  .object({
    recipients: z.array(PhoneRecipientSchema).min(1).optional(),
    contactIds: z.array(z.string().min(1)).optional(),
    useAllContacts: z.boolean().optional().default(false),
    caption: z.string().min(1).optional(),
    imageUrl: z.string().url(),
    delayMs: z.number().int().min(0).default(1000),
    jitterMs: z.number().int().min(0).default(500),
    checkNumber: z.boolean().default(true),
  })
  .merge(AutomationFieldsSchema)
  .superRefine((val, ctx) => {
    const manualCount = val.recipients?.length ?? 0;
    const contactCount = val.contactIds?.length ?? 0;
    if (!val.imageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ImageUrl required for now',
        path: ['imageUrl'],
      });
    }
    if (manualCount === 0 && contactCount === 0 && !val.useAllContacts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide manual recipients, select contact IDs, or set useAllContacts',
        path: ['recipients'],
      });
    }

    if (val.isScheduled) {
      if (!val.timetableRepeater) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Missing timetableRepeater for scheduled campaign',
          path: ['timetableRepeater'],
        });
      }
      if (!val.scheduledTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Missing scheduledTime',
          path: ['scheduledTime'],
        });
      }
      if (
        val.timetableRepeater === 'ONCE' ||
        val.timetableRepeater === 'EVERY_WEEK' ||
        val.timetableRepeater === 'EVERY_MONTH'
      ) {
        if (!val.scheduledDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Missing scheduledDate for given repeater',
            path: ['scheduledDate'],
          });
        }
      }
    }
  });

export class BroadcastImageDto extends createZodDto(BroadcastImageSchema) {}

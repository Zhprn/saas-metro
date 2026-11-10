import { z } from 'zod';
import { createZodDto } from '@anatine/zod-nestjs';

export const GroupSendTextSchema = z.object({
  groupJid: z.string().min(10), // e.g. "1203630xxxxxxx@g.us"
  text: z.string().min(1),
});

export class GroupSendTextDto extends createZodDto(GroupSendTextSchema) {}

export const GroupSendImageSchema = z.object({
  groupJid: z.string().min(10),
  imageUrl: z.string().url(),
  caption: z.string().optional(),
});

export class GroupSendImageDto extends createZodDto(GroupSendImageSchema) {}

export const GroupDmMembersTextSchema = z.object({
  groupJid: z.string().min(10),
  text: z.string().min(1),
  delayMs: z.number().int().min(0).default(1500),
  jitterMs: z.number().int().min(0).default(600),
  includeAdmins: z.boolean().default(true),
});

export class GroupDmMembersTextDto extends createZodDto(
  GroupDmMembersTextSchema,
) {}

export const GroupDmMembersImageSchema = z.object({
  groupJid: z.string().min(10),
  imageUrl: z.string().url(),
  caption: z.string().optional(),
  delayMs: z.number().int().min(0).default(1800),
  jitterMs: z.number().int().min(0).default(700),
  includeAdmins: z.boolean().default(true),
});

export class GroupDmMembersImageDto extends createZodDto(
  GroupDmMembersImageSchema,
) {}

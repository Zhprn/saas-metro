import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const ImportGroupContactsSchema = z.object({
  groupJid: z.string().trim().min(1),
});

export class ImportGroupContactsDto extends createZodDto(
  ImportGroupContactsSchema,
) {}

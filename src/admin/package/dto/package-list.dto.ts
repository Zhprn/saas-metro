import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

// Schema untuk create package list (Master Fitur)
export const CreatePackageListSchema = z.object({
  name: z.string().min(1, 'Feature name cannot be empty'),
});

export class CreatePackageListDto extends createZodDto(
  CreatePackageListSchema,
) {}

// Schema untuk update package list
export const UpdatePackageListSchema = z.object({
  name: z.string().min(1, 'Feature name cannot be empty').optional(),
});

export class UpdatePackageListDto extends createZodDto(
  UpdatePackageListSchema,
) {}

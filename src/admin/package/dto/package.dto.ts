import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

// Enum untuk billing cycle
export const BillingCycleEnum = z.enum(['monthly', 'yearly']);

export type BillingCycle = z.infer<typeof BillingCycleEnum>;

// Schema untuk create package
export const CreatePackageSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().min(0),
  currency: z.string().default('IDR'),
  billingCycle: BillingCycleEnum,
  packageListIds: z.array(z.string()).min(1, 'Pilih minimal satu fitur'),
});

export class CreatePackageDto extends createZodDto(CreatePackageSchema) {}

// Schema untuk update package
export const UpdatePackageSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().optional(),
  billingCycle: BillingCycleEnum.optional(),
  packageListIds: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
});

export class UpdatePackageDto extends createZodDto(UpdatePackageSchema) {}

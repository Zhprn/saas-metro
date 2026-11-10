import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';
import { TestimonialStatus } from '@prisma/client';

export const UpdateTestimonialSchema = z.object({
  customerName: z
    .string()
    .min(3, 'Customer name must be at least 3 characters long')
    .optional(),

  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters long')
    .optional(),

  businessType: z
    .string()
    .min(2, 'Business type must be at least 2 characters long')
    .optional(),

  location: z.string().max(100).optional().nullable(),

  rating: z.coerce.number().int().min(1).max(5).optional(),

  quote: z.string().min(10, 'Quote is too short').optional(),

  avatarUrl: z.string().url().optional().nullable(),

  status: z.nativeEnum(TestimonialStatus).optional(),

  isFeatured: z.boolean().optional(),
});

export class UpdateTestimonialDto extends createZodDto(
  UpdateTestimonialSchema,
) {}

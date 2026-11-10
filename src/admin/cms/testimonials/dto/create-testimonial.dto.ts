import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';
import { TestimonialStatus } from '@prisma/client';

export const CreateTestimonialSchema = z.object({
  customerName: z
    .string()
    .min(3, 'Customer name must be at least 3 characters long')
    .max(50, 'Customer name is too long'),

  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters long'),

  businessType: z
    .string()
    .min(2, 'Business type must be at least 2 characters long'),

  location: z
    .string()
    .max(100, 'Location description is too long')
    .optional()
    .nullable(),

  rating: z.coerce
    .number()
    .int()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot be more than 5'),

  quote: z
    .string()
    .min(
      10,
      'Testimonial quote should be at least 10 characters for better credibility',
    )
    .max(500, 'Quote is too long'),

  avatarUrl: z.string().url('Invalid image URL format').optional().nullable(),

  status: z.nativeEnum(TestimonialStatus).default(TestimonialStatus.PENDING),

  isFeatured: z.boolean().default(false),
});

export class CreateTestimonialDto extends createZodDto(
  CreateTestimonialSchema,
) {}

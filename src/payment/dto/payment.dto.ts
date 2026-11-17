import { createZodDto } from '@anatine/zod-nestjs';
import { z } from 'zod';

export const CreateOrderSchema = z.object({
  packageId: z.string().min(1),
});

export class CreateOrderDto extends createZodDto(CreateOrderSchema) {}

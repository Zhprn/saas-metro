import { z } from 'zod';

export const VerifyEmailSchema = z.object({
  token: z.string().min(40),
});
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

export const ResendVerifySchema = z.object({
  email: z.string().email(),
});
export type ResendVerifyDto = z.infer<typeof ResendVerifySchema>;

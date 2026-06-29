import { z } from 'zod';

export const emailSchema = z.object({
	retryAttempts: z.number().int().min(1).max(10).default(2),
	retryDelayMs: z.number().int().min(0).max(60000).default(1000),
});

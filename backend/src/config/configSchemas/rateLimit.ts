import { z } from 'zod';

export const rateLimitSchema = z.object({
	authEnabled: z.boolean().default(true),
	backend: z.enum(['memory', 'database']),
	enabled: z.boolean().default(true),
	maxRequests: z.number().int(),
	windowMs: z.number().int(),
});

import { z } from 'zod';

export const testingSchema = z.object({
	crawlContentMinLength: z.number().int(),
	crawlInteractionDelay: z.number().int(),
	crawlLoginEmail: z.string().optional().default(''),
	crawlLoginPassword: z.string().optional().default(''),
	crawlMaxDepth: z.number().int(),
	crawlPageSettleDelay: z.number().int(),
	crawlSeedRoutes: z.array(z.string()).optional().default([]),
	crawlTimeout: z.number().int(),
});

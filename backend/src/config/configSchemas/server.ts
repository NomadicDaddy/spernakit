import { z } from 'zod';

export const serverSchema = z.object({
	backendPort: z.number().int().min(1).max(65535),
	backendUrl: z.string().url(),
	frontendPort: z.number().int().min(1).max(65535),
	frontendUrl: z.string().url(),
	host: z.string().default('0.0.0.0'),
	maxRequestBodySize: z
		.number()
		.int()
		.min(1024)
		.default(10 * 1024 * 1024),
	nodeEnv: z.enum(['development', 'production', 'preview', 'test']).default('development'),
	timezone: z.string().default('UTC'),
	trustedProxies: z.array(z.string()).default([]),
	trustProxy: z.boolean().default(false),
});

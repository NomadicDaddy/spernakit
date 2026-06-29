import { z } from 'zod';

export const tokenCleanupSchema = z.object({
	enabled: z.boolean().default(true),
	intervalHours: z.number().int(),
	minimumIntervalHours: z.number().int(),
});

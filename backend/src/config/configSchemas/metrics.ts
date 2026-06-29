import { z } from 'zod';

export const metricsSchema = z.object({
	collectionIntervalMs: z.number().int(),
});

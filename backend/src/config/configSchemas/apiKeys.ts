import { z } from 'zod';

export const apiKeysSchema = z.object({
	maxPerUser: z.number().int().min(1).default(10),
});

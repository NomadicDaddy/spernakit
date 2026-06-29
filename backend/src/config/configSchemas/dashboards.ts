import { z } from 'zod';

export const dashboardsSchema = z.object({
	enabled: z.boolean().default(true),
	maxPerUser: z.number().int().min(1),
	sharingEnabled: z.boolean(),
});

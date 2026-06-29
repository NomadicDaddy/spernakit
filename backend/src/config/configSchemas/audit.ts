import { z } from 'zod';

export const auditSchema = z.object({
	enabled: z.boolean().default(true),
	ipWhitelist: z.array(z.string()).default([]),
});

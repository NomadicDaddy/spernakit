import { z } from 'zod';

import { withEmptyDefault } from '../configUtilsZod';

export const healthCheckThresholdSchema = z.object({
	critical: z.number(),
	warn: z.number(),
});

export const healthCheckThresholdsSchema = z.object({
	auth: healthCheckThresholdSchema,
	db: healthCheckThresholdSchema,
	fs: healthCheckThresholdSchema,
	memory: healthCheckThresholdSchema,
});

export const healthCheckSchema = z.object({
	enabled: z.boolean().default(true),
	interval: z.number().int(),
	retentionDays: z.number().int(),
	thresholds: withEmptyDefault(healthCheckThresholdsSchema),
});

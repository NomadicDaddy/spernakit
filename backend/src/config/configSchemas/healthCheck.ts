import { Type, withEmptyDefault } from '../configSchemaHelpers';

export const healthCheckThresholdSchema = Type.Object({
	critical: Type.Number(),
	warn: Type.Number(),
});

export const healthCheckThresholdsSchema = Type.Object({
	auth: healthCheckThresholdSchema,
	db: healthCheckThresholdSchema,
	fs: healthCheckThresholdSchema,
	memory: healthCheckThresholdSchema,
});

export const healthCheckSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	interval: Type.Integer(),
	retentionDays: Type.Integer(),
	thresholds: withEmptyDefault(healthCheckThresholdsSchema),
});

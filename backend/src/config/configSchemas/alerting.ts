import { z } from 'zod';

import { withEmptyDefault } from '../configUtilsZod';

export const alertingEmailSchema = z.object({
	enabled: z.boolean().default(false),
	recipients: z.array(z.string().email()).default([]),
});

export const alertingWebhookSchema = z.object({
	enabled: z.boolean().default(false),
	headers: z.record(z.string(), z.string()).default({}),
	secret: z.string().default(''),
	timeoutMs: z.number().int(),
	url: z.string().url().or(z.literal('')).default(''),
});

export const alertingInAppSchema = z.object({
	enabled: z.boolean().default(true),
});

export const alertingSchema = z.object({
	cooldownMinutes: z.number().int().min(1),
	email: withEmptyDefault(alertingEmailSchema),
	inApp: withEmptyDefault(alertingInAppSchema),
	webhook: withEmptyDefault(alertingWebhookSchema),
});

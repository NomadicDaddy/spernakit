import { z } from 'zod';

export const loggingFileSchema = z.object({
	enabled: z.boolean().default(false),
	maxFiles: z.number().int().positive().default(10),
	maxSize: z.string().default('10M'),
	path: z.string().default('./logs/app.log'),
});

export const loggingSchema = z.object({
	file: loggingFileSchema.default({
		enabled: false,
		maxFiles: 10,
		maxSize: '10M',
		path: './logs/app.log',
	}),
	level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

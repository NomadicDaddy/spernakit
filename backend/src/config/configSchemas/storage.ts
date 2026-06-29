import { z } from 'zod';

import { withEmptyDefault } from '../configUtilsZod';

export const storageS3Schema = z.object({
	accessKeyId: z.string().default(''),
	bucket: z.string().default(''),
	endpoint: z.string().default(''),
	region: z.string().default(''),
	secretAccessKey: z.string().default(''),
});

export const storageSchema = z.object({
	adapter: z.enum(['local', 's3']).default('local'),
	allowedMimeTypes: z
		.array(z.string())
		.default([
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/webp',
			'application/pdf',
			'text/plain',
			'text/csv',
			'application/json',
		]),
	maxFileSize: z.number().int(),
	s3: withEmptyDefault(storageS3Schema),
});

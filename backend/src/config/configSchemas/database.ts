import { z } from 'zod';

import { withEmptyDefault } from '../configUtilsZod';

export const databaseVacuumSchema = z.object({
	enabled: z.boolean().default(true),
	intervalHours: z.number().int().min(1),
});

export const databaseBackupSchema = z.object({
	compress: z.boolean().default(false),
	enabled: z.boolean().default(true),
	encrypt: z.boolean().default(true),
	intervalHours: z.number().int().min(1),
	location: z.string().default('./backups'),
	retentionDays: z.number().int().min(1),
});

export const databaseIntegrityCheckSchema = z.object({
	enabled: z.boolean().default(true),
	intervalHours: z.number().int().min(1),
	mode: z.enum(['quick', 'full']).default('quick'),
});

export const databaseSslSchema = z.object({
	enabled: z.boolean().default(false),
	rejectUnauthorized: z.boolean().default(true),
});

export const databaseSchema = z.object({
	allowDbPush: z.boolean().default(false),
	backup: withEmptyDefault(databaseBackupSchema),
	busyTimeoutMs: z.number().int().min(0).default(5000),
	dialect: z.enum(['sqlite', 'postgres']).default('sqlite'),
	integrityCheck: withEmptyDefault(databaseIntegrityCheckSchema),
	ssl: withEmptyDefault(databaseSslSchema),
	url: z.string(),
	vacuum: withEmptyDefault(databaseVacuumSchema),
});

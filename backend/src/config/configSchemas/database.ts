import { Type, enumString, withEmptyDefault } from '../configSchemaHelpers';

export const databaseVacuumSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	intervalHours: Type.Integer({ minimum: 1 }),
});

export const databaseBackupSchema = Type.Object({
	compress: Type.Boolean({ default: false }),
	enabled: Type.Boolean({ default: true }),
	encrypt: Type.Boolean({ default: true }),
	intervalHours: Type.Integer({ minimum: 1 }),
	location: Type.String({ default: './backups' }),
	retentionDays: Type.Integer({ minimum: 1 }),
});

export const databaseIntegrityCheckSchema = Type.Object({
	enabled: Type.Boolean({ default: true }),
	intervalHours: Type.Integer({ minimum: 1 }),
	mode: enumString(['quick', 'full'], { default: 'quick' }),
});

export const databaseSslSchema = Type.Object({
	enabled: Type.Boolean({ default: false }),
	rejectUnauthorized: Type.Boolean({ default: true }),
});

export const databaseSchema = Type.Object({
	allowDbPush: Type.Boolean({ default: false }),
	backup: withEmptyDefault(databaseBackupSchema),
	busyTimeoutMs: Type.Integer({ default: 5000, minimum: 0 }),
	dialect: enumString(['sqlite', 'postgres'], { default: 'sqlite' }),
	integrityCheck: withEmptyDefault(databaseIntegrityCheckSchema),
	ssl: withEmptyDefault(databaseSslSchema),
	url: Type.String(),
	vacuum: withEmptyDefault(databaseVacuumSchema),
});

import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { MFA_METHODS } from 'spernakit-shared';

import { users } from './users.ts';

// DB-level domain guard: keep the CHECK list single-sourced from MFA_METHODS.
const MFA_METHOD_IN_LIST = MFA_METHODS.map((method) => `'${method}'`).join(', ');

/**
 * MFA settings table for multi-factor authentication.
 *
 * Stores TOTP secrets (encrypted), backup/recovery codes, and MFA state per user.
 * Each user may have at most one MFA configuration (unique on userId).
 *
 * Intentional omissions:
 * - No soft delete: MFA settings are hard-deleted when disabled.
 * - No updatedBy: Only the owning user can modify their own MFA settings.
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'cascade' — MFA settings are deleted when the user is deleted.
 */
export const mfaSettings = sqliteTable(
	'mfa_settings',
	{
		/** Encrypted JSON array of one-time recovery codes */
		backupCodesEncrypted: text('backup_codes_encrypted'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Whether MFA is fully active (true after initial verification) */
		isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(false),
		/** Last successful MFA verification timestamp */
		lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp' }),
		/** MFA method: totp, email, or sms */
		method: text('method', { enum: MFA_METHODS }).notNull().default('totp'),
		/** AES-256-GCM encrypted TOTP secret */
		secretEncrypted: text('secret_encrypted').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
		userId: integer('user_id').notNull().unique(),
	},
	(table) => [
		check('chk_mfa_settings_method', sql`${table.method} in (${sql.raw(MFA_METHOD_IN_LIST)})`),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_mfa_settings_user_id_users',
		}).onDelete('cascade'),
	]
);

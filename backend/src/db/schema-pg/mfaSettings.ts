import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	foreignKey,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { MFA_METHODS } from 'spernakit-shared';

import { users } from './users.ts';

// DB-level domain guard: keep the CHECK list single-sourced from MFA_METHODS.
const MFA_METHOD_IN_LIST = MFA_METHODS.map((method) => `'${method}'`).join(', ');

/**
 * MFA settings table for multi-factor authentication (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/mfaSettings.ts).
 * @see ../schema/mfaSettings.ts for full documentation
 */
const mfaSettings = pgTable(
	'mfa_settings',
	{
		backupCodesEncrypted: text('backup_codes_encrypted'),
		createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
		id: serial('id').primaryKey(),
		isEnabled: boolean('is_enabled').notNull().default(false),
		lastVerifiedAt: timestamp('last_verified_at', { mode: 'date' }),
		method: text('method', { enum: MFA_METHODS }).notNull().default('totp'),
		secretEncrypted: text('secret_encrypted').notNull(),
		updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
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

export { mfaSettings };

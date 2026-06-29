import { relations, sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { OAUTH_PROVIDERS } from 'spernakit-shared';

import { users } from './users.ts';

// DB-level domain guard: keep the CHECK list single-sourced from OAUTH_PROVIDERS.
const OAUTH_PROVIDER_IN_LIST = OAUTH_PROVIDERS.map((provider) => `'${provider}'`).join(', ');

/**
 * OAuth accounts table for linking third-party OAuth providers to user accounts.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy for recoverable deletion
 * - Audit fields: createdBy, updatedBy for tracking who linked/modified OAuth accounts
 * - Encryption: OAuth tokens are encrypted at rest using AES-256-GCM
 *
 * Soft-delete + unique constraint note:
 * This table has two composite unique indexes: (provider, providerAccountId) and
 * (userId, provider). Soft-deleted records still occupy both unique index slots. If an
 * OAuth unlink feature is added in the future, it MUST use hard-delete (not soft-delete)
 * to free the unique constraint slots and allow relinking. The audit plugin captures the
 * unlink event before deletion, so audit coverage is preserved with hard-delete.
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'cascade' - When a user is deleted, all their linked OAuth accounts are
 *   automatically removed. OAuth links are identity credentials with no standalone value.
 * - createdBy: onDelete 'set null' — OAuth records persist when the creating user is deleted.
 * - updatedBy: onDelete 'set null' — OAuth records persist when the updating user is deleted.
 */
const oauthAccounts = sqliteTable(
	'oauth_accounts',
	{
		accessTokenEncrypted: text('access_token_encrypted'),
		accessTokenIv: text('access_token_iv'),
		accessTokenSalt: text('access_token_salt'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		profile: text('profile', { mode: 'json' }).$type<Record<string, unknown>>(),
		provider: text('provider', {
			enum: OAUTH_PROVIDERS,
		}).notNull(),
		providerAccountId: text('provider_account_id').notNull(),
		refreshTokenEncrypted: text('refresh_token_encrypted'),
		refreshTokenIv: text('refresh_token_iv'),
		refreshTokenSalt: text('refresh_token_salt'),
		tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		userId: integer('user_id').notNull(),
	},
	(table) => [
		check(
			'chk_oauth_accounts_provider',
			sql`${table.provider} in (${sql.raw(OAUTH_PROVIDER_IN_LIST)})`
		),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_oauth_accounts_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: 'fk_oauth_accounts_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_oauth_accounts_updated_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_oauth_accounts_user_id_users',
		}).onDelete('cascade'),
		index('idx_oauth_accounts_user_id').on(table.userId),
		index('idx_oauth_accounts_is_deleted').on(table.isDeleted),
		uniqueIndex('idx_oauth_accounts_provider_account').on(
			table.provider,
			table.providerAccountId
		),
		uniqueIndex('idx_oauth_accounts_user_provider').on(table.userId, table.provider),
	]
);

const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
	user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}));

export { oauthAccounts, oauthAccountsRelations };

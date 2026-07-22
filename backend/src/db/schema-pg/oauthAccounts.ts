import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';
import { OAUTH_PROVIDERS } from 'spernakit-shared';

import { users } from './users.ts';

// DB-level domain guard: keep the CHECK list single-sourced from OAUTH_PROVIDERS.
const OAUTH_PROVIDER_IN_LIST = OAUTH_PROVIDERS.map((provider) => `'${provider}'`).join(', ');

/**
 * OAuth accounts table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/oauthAccounts.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp', text with mode: 'json'
 * - PostgreSQL: native timestamp/jsonb types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * Table features:
 * - Soft delete, audit fields
 * - Encryption: OAuth tokens are encrypted at rest using AES-256-GCM
 *
 * @see ../schema/oauthAccounts.ts for SQLite variant and full documentation
 */
const oauthAccounts = pgTable(
	'oauth_accounts',
	{
		accessTokenEncrypted: text('access_token_encrypted'),
		accessTokenIv: text('access_token_iv'),
		accessTokenSalt: text('access_token_salt'),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		id: serial('id').primaryKey(),
		isDeleted: boolean('is_deleted').notNull().default(false),
		profile: jsonb('profile').$type<Record<string, unknown>>(),
		provider: text('provider', {
			enum: OAUTH_PROVIDERS,
		}).notNull(),
		providerAccountId: text('provider_account_id').notNull(),
		refreshTokenEncrypted: text('refresh_token_encrypted'),
		refreshTokenIv: text('refresh_token_iv'),
		refreshTokenSalt: text('refresh_token_salt'),
		tokenExpiresAt: timestamp('token_expires_at', { mode: 'date' }),
		updatedAt: timestamp('updated_at', { mode: 'date' })
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

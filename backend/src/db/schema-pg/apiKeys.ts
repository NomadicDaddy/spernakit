import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';
import { API_KEY_SCOPES } from 'spernakit-shared';

const API_KEY_SCOPE_VALUES = Object.values(API_KEY_SCOPES) as unknown as readonly [
	string,
	...string[],
];

// DB-level domain guard: keep the CHECK list single-sourced from API_KEY_SCOPES.
const API_KEY_SCOPE_IN_LIST = API_KEY_SCOPE_VALUES.map((scope) => `'${scope}'`).join(', ');

import { users } from './users.ts';

/**
 * API keys table for programmatic access authentication (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/apiKeys.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'/'boolean'
 * - PostgreSQL: native timestamp/boolean types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/apiKeys.ts for SQLite variant and full documentation
 */
export const apiKeys = pgTable(
	'api_keys',
	{
		createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
		createdBy: integer('created_by').notNull(),
		expiresAt: timestamp('expires_at', { mode: 'date' }),
		id: serial('id').primaryKey(),
		isActive: boolean('is_active').notNull().default(true),
		keyHash: text('key_hash').notNull(),
		keyIndexHash: text('key_index_hash').notNull().unique(),
		keyName: text('key_name').notNull(),
		keyScope: text('key_scope', { enum: API_KEY_SCOPE_VALUES }).notNull().default('read'),
		keySecret: text('key_secret'),
		lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
		updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
	},
	(table) => [
		check(
			'chk_api_keys_key_scope',
			sql`${table.keyScope} in (${sql.raw(API_KEY_SCOPE_IN_LIST)})`
		),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_api_keys_created_by_users',
		}).onDelete('cascade'),
		index('idx_api_keys_created_by').on(table.createdBy),
		index('idx_api_keys_is_active').on(table.isActive),
		index('idx_api_keys_expires_at').on(table.expiresAt),
		uniqueIndex('idx_api_keys_user_key_name').on(table.createdBy, table.keyName),
	]
);

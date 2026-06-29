import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { API_KEY_SCOPES } from 'spernakit-shared';

const API_KEY_SCOPE_VALUES = Object.values(API_KEY_SCOPES) as unknown as readonly [
	string,
	...string[],
];

// DB-level domain guard: keep the CHECK list single-sourced from API_KEY_SCOPES.
const API_KEY_SCOPE_IN_LIST = API_KEY_SCOPE_VALUES.map((scope) => `'${scope}'`).join(', ');

import { users } from './users.ts';

/**
 * API keys table for programmatic access authentication.
 *
 * Intentional omissions:
 * - No soft delete: Keys use isActive flag for revocation — revoked keys are never restored.
 * - No updatedBy: Keys are created once and can only be revoked (isActive=false), not edited.
 *
 * Foreign key cascade behavior:
 * - createdBy: onDelete 'cascade' — API keys are deleted when the creating user is deleted.
 */
export const apiKeys = sqliteTable(
	'api_keys',
	{
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		createdBy: integer('created_by').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		keyHash: text('key_hash').notNull(),
		keyIndexHash: text('key_index_hash').notNull().unique(),
		keyName: text('key_name').notNull(),
		keyScope: text('key_scope', { enum: API_KEY_SCOPE_VALUES }).notNull().default('read'),
		keySecret: text('key_secret'),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
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

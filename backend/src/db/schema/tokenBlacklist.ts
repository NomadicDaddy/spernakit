import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.ts';

/**
 * Token blacklist table for persistent JWT revocation.
 *
 * Stores SHA-256 hashes of revoked access tokens with their expiry timestamps.
 * Replaces the in-memory blacklist to survive process restarts.
 *
 * `revokesAll` separates the two kinds of row. A sentinel written by revokeAllUserTokens revokes
 * every access token the user was issued before it; a row for one revoked token (a logout) revokes
 * only that token, so signing out of one browser leaves the user's other sign-ins working.
 *
 * Intentional omissions:
 * - No soft delete: Ephemeral entries — expired entries are hard-deleted by cleanup task.
 * - No createdBy/updatedBy: System-managed entries with no human actor.
 * - No audit fields: Transient revocation state, not business data.
 */
export const tokenBlacklist = sqliteTable(
	'token_blacklist',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		revokesAll: integer('revokes_all', { mode: 'boolean' }).notNull().default(true),
		tokenHash: text('token_hash').notNull().unique(),
		userId: integer('user_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_token_blacklist_user_id_users',
		}).onDelete('cascade'),
		// idx_token_blacklist_token_hash omitted — UNIQUE constraint on tokenHash
		// already creates an implicit index in SQLite
		index('idx_token_blacklist_expires_at').on(table.expiresAt),
		index('idx_token_blacklist_user_id').on(table.userId),
	],
);

import { foreignKey, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users.ts';

/**
 * Token blacklist table for persistent JWT revocation
 * (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/tokenBlacklist.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode:'timestamp' (epoch seconds, Date objects in ORM)
 * - PostgreSQL: native timestamp with mode:'date' (Date objects in ORM)
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/tokenBlacklist.ts for SQLite variant and full documentation
 */
export const tokenBlacklist = pgTable(
	'token_blacklist',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
		id: serial('id').primaryKey(),
		tokenHash: text('token_hash').notNull().unique(),
		userId: integer('user_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_token_blacklist_user_id_users',
		}).onDelete('cascade'),
		index('idx_token_blacklist_expires_at').on(table.expiresAt),
		index('idx_token_blacklist_user_id').on(table.userId),
	]
);

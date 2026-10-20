import { foreignKey, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users.ts';

/**
 * Refresh tokens, one row per token, grouped into families
 * (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/refreshSessions.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode:'timestamp' (epoch seconds, Date objects in ORM)
 * - PostgreSQL: native timestamp with mode:'date' (Date objects in ORM)
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/refreshSessions.ts for SQLite variant and full documentation
 */
export const refreshSessions = pgTable(
	'refresh_sessions',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
		familyId: text('family_id').notNull(),
		id: serial('id').primaryKey(),
		rotatedAt: timestamp('rotated_at', { mode: 'date' }),
		tokenHash: text('token_hash').notNull().unique(),
		userId: integer('user_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_refresh_sessions_user_id_users',
		}).onDelete('cascade'),
		index('idx_refresh_sessions_expires_at').on(table.expiresAt),
		index('idx_refresh_sessions_family_id').on(table.familyId),
		index('idx_refresh_sessions_user_id').on(table.userId),
	],
);

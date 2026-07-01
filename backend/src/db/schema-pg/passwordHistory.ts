import {
	foreignKey,
	index,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';

import { users } from './users.ts';

/**
 * Password history table for preventing password reuse
 * (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/passwordHistory.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode:'timestamp' (epoch seconds, Date objects in ORM)
 * - PostgreSQL: native timestamp with mode:'date' (Date objects in ORM)
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/passwordHistory.ts for SQLite variant and full documentation
 */
export const passwordHistory = pgTable(
	'password_history',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		id: serial('id').primaryKey(),
		passwordHash: text('password_hash').notNull(),
		userId: integer('user_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_password_history_user_id_users',
		}).onDelete('cascade'),
		index('idx_password_history_user_id').on(table.userId),
		index('idx_password_history_created_at').on(table.createdAt),
		uniqueIndex('idx_password_history_user_hash').on(table.userId, table.passwordHash),
	]
);

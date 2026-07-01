import { foreignKey, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users.ts';

/**
 * Email change tokens (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant
 * (../schema/emailChangeTokens.ts). Type mappings differ by dialect:
 * - SQLite: integer with mode:'timestamp' (epoch seconds, Date in ORM)
 * - PostgreSQL: native timestamp with mode:'date' (Date in ORM)
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/emailChangeTokens.ts for SQLite variant and full documentation
 */
const emailChangeTokens = pgTable(
	'email_change_tokens',
	{
		consumedAt: timestamp('consumed_at', { mode: 'date' }),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
		id: serial('id').primaryKey(),
		newEmail: text('new_email').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		userId: integer('user_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_email_change_tokens_user_id_users',
		}).onDelete('cascade'),
		index('idx_email_change_tokens_user_id').on(table.userId),
		index('idx_email_change_tokens_expires_at').on(table.expiresAt),
	]
);

export { emailChangeTokens };

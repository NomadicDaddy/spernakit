import { index, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * PKCE code verifier storage for OAuth flows (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/pkceVerifiers.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'
 * - PostgreSQL: native timestamp type
 *
 * @see ../schema/pkceVerifiers.ts for SQLite variant and full documentation
 */
export const pkceVerifiers = pgTable(
	'pkce_verifiers',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
		id: serial('id').primaryKey(),
		state: text('state').notNull(),
		verifier: text('verifier').notNull(),
	},
	(table) => [
		uniqueIndex('idx_pkce_verifiers_state').on(table.state),
		index('idx_pkce_verifiers_expires_at').on(table.expiresAt),
	]
);

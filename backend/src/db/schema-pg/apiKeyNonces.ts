import { index, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * API key nonces table for replay attack prevention (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/apiKeyNonces.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'
 * - PostgreSQL: native timestamp types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/apiKeyNonces.ts for SQLite variant and full documentation
 */
export const apiKeyNonces = pgTable(
	'api_key_nonces',
	{
		createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
		expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
		id: serial('id').primaryKey(),
		nonce: text('nonce').notNull().unique(),
	},
	(table) => [index('idx_api_key_nonces_expires_at').on(table.expiresAt)]
);

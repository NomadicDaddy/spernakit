import { index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Rate limit entries table for tracking request counts per key within time windows
 * (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/rateLimitEntries.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode:'timestamp' (epoch seconds, Date objects in ORM)
 * - PostgreSQL: native timestamp with mode:'date' (Date objects in ORM)
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/rateLimitEntries.ts for SQLite variant and full documentation
 */
export const rateLimitEntries = pgTable(
	'rate_limit_entries',
	{
		count: integer('count').notNull().default(0),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		id: serial('id').primaryKey(),
		key: text('key').notNull().unique(),
		resetAt: timestamp('reset_at', { mode: 'date' }).notNull(),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [index('idx_rate_limit_entries_reset_at').on(table.resetAt)]
);

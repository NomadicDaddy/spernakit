import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Rate limit entries table for tracking request counts per key within time windows.
 *
 * Intentional omissions:
 * - No soft delete: Ephemeral entries — expired entries are hard-deleted by cleanup task.
 * - No createdBy/updatedBy: System-managed counters with no human actor.
 * - No audit fields: Transient rate-limiting state, not business data.
 */
export const rateLimitEntries = sqliteTable(
	'rate_limit_entries',
	{
		count: integer('count').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		id: integer('id').primaryKey({ autoIncrement: true }),
		key: text('key').notNull().unique(),
		resetAt: integer('reset_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [index('idx_rate_limit_entries_reset_at').on(table.resetAt)]
);

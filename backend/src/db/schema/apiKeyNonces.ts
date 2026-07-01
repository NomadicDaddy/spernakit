import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * API key nonces table for replay attack prevention.
 *
 * Intentional omissions:
 * - No soft delete: Ephemeral anti-replay records — expired nonces are hard-deleted by cleanup task.
 * - No createdBy/updatedBy: System-managed security state with no human actor.
 */
export const apiKeyNonces = sqliteTable(
	'api_key_nonces',
	{
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		nonce: text('nonce').notNull().unique(),
	},
	(table) => [index('idx_api_key_nonces_expires_at').on(table.expiresAt)]
);

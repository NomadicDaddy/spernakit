import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * PKCE code verifier storage for OAuth flows.
 *
 * Persists PKCE code verifiers to the database so in-flight OAuth flows
 * survive server restarts. Entries are short-lived (5-minute TTL) and
 * hard-deleted by a scheduled cleanup task after expiry.
 *
 * Intentional omissions:
 * - No soft delete: Ephemeral entries — expired entries are hard-deleted by cleanup task.
 * - No updatedBy/updatedBy: System-managed entries with no human actor.
 * - No audit fields: Transient OAuth state, not business data.
 */
export const pkceVerifiers = sqliteTable(
	'pkce_verifiers',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		state: text('state').notNull(),
		verifier: text('verifier').notNull(),
	},
	(table) => [
		uniqueIndex('idx_pkce_verifiers_state').on(table.state),
		index('idx_pkce_verifiers_expires_at').on(table.expiresAt),
	]
);

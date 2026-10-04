import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.ts';

/**
 * Refresh tokens, one row per token, grouped into families.
 *
 * A family is one sign-in: login, MFA verification and OAuth each start a new one, and every
 * refresh rotates within it by marking the presented row `rotatedAt` and inserting its successor.
 * A user therefore holds one family per signed-in browser, and a second sign-in no longer
 * overwrites the first. Presenting a row that was already rotated is a replay and ends only that
 * family. Access tokens carry the family id, and an access token is honoured only while its family
 * still has an unrotated, unexpired row, so ending a family signs that session out immediately.
 *
 * Rotated rows are kept until they expire so a replay can still be recognised.
 *
 * Intentional omissions:
 * - No soft delete: ending a session hard-deletes its family; expired rows are hard-deleted by the
 *   token-cleanup task.
 * - No createdBy/updatedBy: System-managed entries with no human actor.
 * - No audit fields: Transient session state, not business data.
 */
export const refreshSessions = sqliteTable(
	'refresh_sessions',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		familyId: text('family_id').notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		rotatedAt: integer('rotated_at', { mode: 'timestamp' }),
		tokenHash: text('token_hash').notNull().unique(),
		userId: integer('user_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_refresh_sessions_user_id_users',
		}).onDelete('cascade'),
		// idx_refresh_sessions_token_hash omitted — UNIQUE constraint on tokenHash
		// already creates an implicit index in SQLite
		index('idx_refresh_sessions_expires_at').on(table.expiresAt),
		index('idx_refresh_sessions_family_id').on(table.familyId),
		index('idx_refresh_sessions_user_id').on(table.userId),
	],
);

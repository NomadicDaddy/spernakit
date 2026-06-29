import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.ts';

/**
 * Email change tokens — one-time tokens that gate the "change account email" flow.
 *
 * Created when an authenticated user requests an email change via
 * `POST /api/v1/users/me/email-change`. The user's email is NOT updated in
 * `users.email` at request time; a token is stored here and delivered to the
 * NEW address, and the column flips only when the user clicks the confirmation
 * link (which calls `POST /api/v1/auth/confirm-email-change`).
 *
 * This closes an account-takeover pivot: a stolen session cookie could
 * previously change `users.email` directly via `PUT /me`, and then trigger
 * `POST /auth/forgot-password` against the new (attacker-controlled) address.
 *
 * Token lifecycle invariants:
 * - `tokenHash` stores SHA-256(token); the plaintext token is delivered once,
 *   by email, to the NEW address and never persisted.
 * - `consumedAt` is set at confirm time. Consumed rows are kept for audit
 *   purposes and retention cleanup rather than hard-deleted at confirm time.
 * - Expired/consumed tokens are purged by a scheduled job using
 *   `expiresAt`/`consumedAt`.
 *
 * Indexes:
 * - idx_email_change_tokens_user_id: lookup the most recent pending request
 *   per user (also drives FK cascade on user soft-delete cleanup).
 * - idx_email_change_tokens_token_hash: UNIQUE; primary lookup path at confirm
 *   time and prevents two requests from colliding on the same token hash.
 */
const emailChangeTokens = sqliteTable(
	'email_change_tokens',
	{
		consumedAt: integer('consumed_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
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

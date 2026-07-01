import {
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { users } from './users.ts';

/**
 * Password history table for preventing password reuse.
 *
 * Stores the N most recent password hashes per user to enforce password
 * history policies. When a user changes their password, the system checks
 * the new password against stored historical hashes.
 *
 * Intentional omissions:
 * - No soft delete: Security records — old entries are hard-deleted when
 *   they exceed the configured history depth.
 * - No updatedBy: System-managed records, not user-editable.
 * - No audit fields: Password hashes are sensitive; audit logs cover the
 *   password change event itself.
 */
export const passwordHistory = sqliteTable(
	'password_history',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		id: integer('id').primaryKey({ autoIncrement: true }),
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

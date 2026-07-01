import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { NOTIFICATION_TYPES } from 'spernakit-shared';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

/**
 * Notifications table for user notifications and alerts.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy for recoverable deletion
 * - Audit fields: createdBy for tracking who created the notification (nullable for system-generated)
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'cascade' - When a user is deleted, all their notifications are
 *   automatically removed. Notifications are user-specific and have no value without the user.
 * - workspaceId: onDelete 'cascade' - When a workspace is deleted, all notifications for that
 *   workspace are automatically removed as they are no longer relevant.
 * - createdBy: onDelete 'set null' — Notification records persist when the creating user is deleted.
 * - deletedBy: onDelete 'set null' — Notification records persist when the deleting user is deleted.
 */
const notifications = sqliteTable(
	'notifications',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		message: text('message').notNull(),
		metadata: text('metadata', { mode: 'json' }),
		readAt: integer('read_at', { mode: 'timestamp' }),
		title: text('title').notNull(),
		type: text('type', { enum: NOTIFICATION_TYPES }).notNull().default('info'),
		userId: integer('user_id').notNull(),
		workspaceId: integer('workspace_id'),
	},
	(table) => [
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_notifications_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: 'fk_notifications_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_notifications_user_id_users',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: 'fk_notifications_workspace_id_workspaces',
		}).onDelete('cascade'),
		index('idx_notifications_user_id').on(table.userId),
		index('idx_notifications_type').on(table.type),
		index('idx_notifications_is_deleted').on(table.isDeleted),
		index('idx_notifications_user_read').on(table.userId, table.readAt),
		index('idx_notifications_user_deleted_created').on(
			table.userId,
			table.isDeleted,
			table.createdAt
		),
		index('idx_notifications_user_workspace_deleted_created').on(
			table.userId,
			table.workspaceId,
			table.isDeleted,
			table.createdAt
		),
	]
);

/**
 * User notification preferences table for per-user notification settings.
 *
 * Table features:
 * - Audit fields: createdBy, updatedBy for tracking who created/modified preferences
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'cascade' - When a user is deleted, their preferences are automatically
 *   removed. Preferences are user-specific configuration with no standalone value.
 * - createdBy: onDelete 'set null' — Preference records persist when the creating user is deleted.
 * - updatedBy: onDelete 'set null' — Preference records persist when the updating user is deleted.
 */
const userNotificationPreferences = sqliteTable(
	'user_notification_preferences',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		preferences: text('preferences', { mode: 'json' }).$type<Record<string, unknown>>(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		userId: integer('user_id').notNull().unique(),
	},
	(table) => [
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_user_notification_preferences_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_user_notification_preferences_updated_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_user_notification_preferences_user_id_users',
		}).onDelete('cascade'),
	]
);

export { notifications, userNotificationPreferences };

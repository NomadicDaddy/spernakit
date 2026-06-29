import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { NOTIFICATION_TYPES } from 'spernakit-shared';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

/**
 * Notifications table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/notifications.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'/'boolean', text with mode: 'json'
 * - PostgreSQL: native timestamp/boolean/jsonb types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/notifications.ts for SQLite variant and full documentation
 */
const notifications = pgTable(
	'notifications',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		id: serial('id').primaryKey(),
		isDeleted: boolean('is_deleted').notNull().default(false),
		message: text('message').notNull(),
		metadata: jsonb('metadata'),
		readAt: timestamp('read_at', { mode: 'date' }),
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
 * User notification preferences table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/notifications.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp', text with mode: 'json'
 * - PostgreSQL: native timestamp/jsonb types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/notifications.ts for SQLite variant and full documentation
 */
const userNotificationPreferences = pgTable(
	'user_notification_preferences',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		id: serial('id').primaryKey(),
		preferences: jsonb('preferences').$type<Record<string, unknown>>(),
		updatedAt: timestamp('updated_at', { mode: 'date' })
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

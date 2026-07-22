import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.ts';

/**
 * Settings table for application-wide key-value configuration.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy for recoverable deletion
 * - Audit fields: createdBy, updatedBy for tracking who created/modified settings
 *
 * Soft-delete + unique constraint note:
 * Soft-deleted settings retain their key in the unique index. To recreate a setting
 * with the same key, undelete the existing record rather than inserting a new one.
 *
 * Foreign key cascade behavior:
 * - createdBy: onDelete 'set null' - Settings persist when the creating user is deleted.
 * - updatedBy: onDelete 'set null' - Settings persist when the updating user is deleted.
 */
const settings = sqliteTable(
	'settings',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		description: text('description'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		isEncrypted: integer('is_encrypted', { mode: 'boolean' }).notNull().default(false),
		key: text('key').notNull().unique(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		value: text('value'),
	},
	(table) => [
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_settings_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: 'fk_settings_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_settings_updated_by_users',
		}).onDelete('set null'),
		index('idx_settings_key_is_deleted').on(table.key, table.isDeleted),
	]
);

export { settings };

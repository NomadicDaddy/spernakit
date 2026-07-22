import {
	boolean,
	foreignKey,
	index,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';

import { users } from './users.ts';

/**
 * Settings table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/settings.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'/'boolean'
 * - PostgreSQL: native timestamp/boolean types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/settings.ts for SQLite variant and full documentation
 */
const settings = pgTable(
	'settings',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		description: text('description'),
		id: serial('id').primaryKey(),
		isDeleted: boolean('is_deleted').notNull().default(false),
		isEncrypted: boolean('is_encrypted').notNull().default(false),
		key: text('key').notNull().unique(),
		updatedAt: timestamp('updated_at', { mode: 'date' })
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

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
import { workspaces } from './workspaces.ts';

/**
 * File uploads table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/fileUploads.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'/'boolean'
 * - PostgreSQL: native timestamp/boolean types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * Soft-delete + unique constraint note:
 * Soft-deleted file records retain their storagePath value in the unique index until the
 * soft-deleted-files cleanup task (services/scheduler/cleanupFiles.ts) permanently
 * hard-deletes them after the configured retention window (config.retention.softDeletedFilesDays).
 * In practice, collision is not a concern because new storage paths are generated with
 * randomUUID() in services/file/upload.ts, making path reuse cryptographically impossible.
 *
 * @see ../schema/fileUploads.ts for SQLite variant and full documentation
 */
const fileUploads = pgTable(
	'file_uploads',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		filename: text('filename').notNull(),
		id: serial('id').primaryKey(),
		isDeleted: boolean('is_deleted').notNull().default(false),
		mimeType: text('mime_type').notNull(),
		originalName: text('original_name').notNull(),
		size: integer('size').notNull(),
		storagePath: text('storage_path').notNull().unique(),
		thumbnailKey: text('thumbnail_key'),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		uploadedBy: integer('uploaded_by'),
		workspaceId: integer('workspace_id'),
	},
	(table) => [
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: 'fk_file_uploads_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_file_uploads_updated_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: 'fk_file_uploads_uploaded_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: 'fk_file_uploads_workspace_id_workspaces',
		}).onDelete('set null'),
		index('idx_file_uploads_uploaded_by').on(table.uploadedBy),
		index('idx_file_uploads_workspace_id').on(table.workspaceId),
		// Compound (isDeleted, deletedAt) supports the scheduled soft-delete
		// cleanup query and also covers the single-column isDeleted filter via
		// its leading column, so no separate idx_file_uploads_is_deleted is needed.
		index('idx_file_uploads_is_deleted_deleted_at').on(table.isDeleted, table.deletedAt),
		index('idx_file_uploads_workspace_id_is_deleted').on(table.workspaceId, table.isDeleted),
	]
);

export { fileUploads };

import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

/**
 * File uploads table for tracking uploaded files and their metadata.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy for recoverable deletion
 * - Audit fields: uploadedBy (serves as createdBy), updatedBy for tracking who uploaded/modified files
 *
 * Soft-delete + unique constraint note:
 * Soft-deleted file records retain their storagePath value in the unique index until the
 * soft-deleted-files cleanup task (services/scheduler/cleanupFiles.ts) permanently
 * hard-deletes them after the configured retention window (config.retention.softDeletedFilesDays).
 * In practice, collision is not a concern because new storage paths are generated with
 * randomUUID() in services/file/upload.ts, making path reuse cryptographically impossible.
 *
 * Foreign key cascade behavior:
 * - uploadedBy: onDelete 'set null' - File records must persist for auditing and data integrity
 *   even when the uploading user is deleted. The uploadedBy is nullified but files remain accessible.
 * - updatedBy: onDelete 'set null' — File records persist when the updating user is deleted.
 * - workspaceId: onDelete 'set null' - Files persist after workspace deletion for data preservation.
 * - deletedBy: onDelete 'set null' — File records persist when the deleting user is deleted.
 */
const fileUploads = sqliteTable(
	'file_uploads',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		filename: text('filename').notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		mimeType: text('mime_type').notNull(),
		originalName: text('original_name').notNull(),
		size: integer('size').notNull(),
		storagePath: text('storage_path').notNull().unique(),
		thumbnailKey: text('thumbnail_key'),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
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

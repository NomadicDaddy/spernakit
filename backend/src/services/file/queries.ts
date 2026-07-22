import { and, count, desc, eq } from 'drizzle-orm';

import type { FileRecord } from './types.ts';

import { getDb } from '../../db/index.ts';
import { fileUploads } from '../../db/schema/fileUploads.ts';
import { getStorageAdapter } from '../../storage/index.ts';
import { isDefined, type PaginatedResponse, paginatedQuery } from '../../utils/dbHelpers.ts';
import { mapFileToRecord } from './types.ts';

/**
 * Download a file by ID.
 *
 * @param id - File ID
 * @param workspaceId - Optional workspace ID to filter by
 * @returns File data and metadata, or null if not found
 */
async function download(
	id: number,
	workspaceId?: null | number
): Promise<{ data: Buffer; filename: string; mimeType: string } | null> {
	const db = getDb();
	const conditions = [eq(fileUploads.id, id), eq(fileUploads.isDeleted, false)];
	if (isDefined(workspaceId)) {
		conditions.push(eq(fileUploads.workspaceId, workspaceId));
	}
	const file = db
		.select()
		.from(fileUploads)
		.where(and(...conditions))
		.get();

	if (!file) return null;

	const storage = getStorageAdapter();
	const fileContent = await storage.read(file.storagePath);

	return {
		data: fileContent,
		filename: file.originalName,
		mimeType: file.mimeType,
	};
}

/**
 * Soft-delete a file by ID.
 *
 * @param id - File ID
 * @param deletedBy - User ID performing the deletion
 * @param workspaceId - Optional workspace ID to filter by
 * @returns True if the file was found and soft-deleted
 */
function softDelete(id: number, deletedBy: number, workspaceId?: null | number): boolean {
	const db = getDb();
	const conditions = [eq(fileUploads.id, id), eq(fileUploads.isDeleted, false)];
	if (isDefined(workspaceId)) {
		conditions.push(eq(fileUploads.workspaceId, workspaceId));
	}
	const file = db
		.select({ id: fileUploads.id })
		.from(fileUploads)
		.where(and(...conditions))
		.get();

	if (!file) return false;

	db.update(fileUploads)
		.set({
			deletedAt: new Date(),
			deletedBy,
			isDeleted: true,
		})
		.where(eq(fileUploads.id, id))
		.run();

	return true;
}

/**
 * Get file metadata by ID.
 *
 * @param id - File ID
 * @param workspaceId - Optional workspace ID to filter by
 * @returns File record or null if not found
 */
function getById(id: number, workspaceId?: null | number): FileRecord | null {
	const db = getDb();
	const conditions = [eq(fileUploads.id, id), eq(fileUploads.isDeleted, false)];
	if (isDefined(workspaceId)) {
		conditions.push(eq(fileUploads.workspaceId, workspaceId));
	}
	const file = db
		.select()
		.from(fileUploads)
		.where(and(...conditions))
		.get();

	if (!file) return null;

	return mapFileToRecord(file);
}

interface ListOptions {
	limit?: number | undefined;
	page?: number | undefined;
	uploadedBy?: number | undefined;
	workspaceId?: null | number | undefined;
}

/**
 * List files with pagination support.
 *
 * @param options - List options (limit, page, workspaceId)
 * @returns Array of file records and total count
 */
function list(options?: ListOptions): PaginatedResponse<FileRecord> {
	const db = getDb();

	const conditions = [eq(fileUploads.isDeleted, false)];
	if (isDefined(options?.workspaceId)) {
		conditions.push(eq(fileUploads.workspaceId, options.workspaceId));
	}
	if (isDefined(options?.uploadedBy)) {
		conditions.push(eq(fileUploads.uploadedBy, options.uploadedBy));
	}

	return paginatedQuery<FileRecord>(
		options?.page,
		options?.limit,
		(limitNum, offsetNum) =>
			db
				.select()
				.from(fileUploads)
				.where(and(...conditions))
				.orderBy(desc(fileUploads.createdAt))
				.limit(limitNum)
				.offset(offsetNum)
				.all()
				.map(mapFileToRecord),
		() =>
			db
				.select({ count: count() })
				.from(fileUploads)
				.where(and(...conditions))
				.get()
	);
}

export { download, getById, list, softDelete };

import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { getConfig } from '../../config/configLoader.ts';
import { MAX_CLEANUP_BATCH_SIZE, MS_PER_DAY } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { fileUploads } from '../../db/schema/fileUploads.ts';
import { getStorageAdapter } from '../../storage/index.ts';
import { UPLOAD_DIR } from '../../storage/localAdapter.ts';
import { logScheduler } from '../../utils/logger.ts';
import { log as logAudit } from '../auditService.ts';
import { cutoffDate, MAX_CLEANUP_BATCHES } from './cleanupUtils.ts';

/** Minimum age before an on-disk file with no matching DB row is treated as orphaned. */
const ORPHAN_MIN_AGE_MS = MS_PER_DAY;

async function softDeletedFilesCleanupTask(): Promise<{ batches: number; cleaned: number }> {
	const config = getConfig();
	const db = getDb();
	const storage = getStorageAdapter();
	const cutoff = cutoffDate(new Date(), config.retention.softDeletedFilesDays);

	let totalCleaned = 0;
	let batches = 0;

	while (batches < MAX_CLEANUP_BATCHES) {
		const files = db
			.select({
				id: fileUploads.id,
				storagePath: fileUploads.storagePath,
				thumbnailKey: fileUploads.thumbnailKey,
			})
			.from(fileUploads)
			.where(and(eq(fileUploads.isDeleted, true), lt(fileUploads.deletedAt, cutoff)))
			.limit(MAX_CLEANUP_BATCH_SIZE)
			.all();

		if (files.length === 0) break;

		// Delete blobs from storage; only hard-delete rows whose blobs are confirmed
		// gone — deleting the row after a failed blob delete would orphan the blob
		// permanently. Failed rows are retried on the next scheduled run.
		const idsToDelete: number[] = [];
		for (const file of files) {
			const blobDeleted = await safeStorageDelete(storage, file.storagePath);
			const thumbnailDeleted = file.thumbnailKey
				? await safeStorageDelete(storage, file.thumbnailKey)
				: true;
			if (blobDeleted && thumbnailDeleted) {
				idsToDelete.push(file.id);
			}
		}

		// No progress in this batch — stop instead of re-fetching the same failures
		if (idsToDelete.length === 0) break;

		db.delete(fileUploads)
			.where(sql`${fileUploads.id} IN ${idsToDelete}`)
			.run();

		totalCleaned += idsToDelete.length;
		batches++;

		logScheduler('info', 'Soft-deleted files cleanup batch completed', {
			batchCleaned: idsToDelete.length,
			batchNumber: batches,
			totalCleaned,
		});
	}

	const orphansRemoved = await cleanupOrphanedUploads(db);

	logScheduler('info', 'Soft-deleted files cleanup task completed', {
		batches,
		cleaned: totalCleaned,
		orphansRemoved,
	});

	// Audit log for permanent file deletion (system-initiated, no userId)
	if (totalCleaned > 0 || orphansRemoved > 0) {
		logAudit({
			action: 'SYSTEM_CLEANUP file_uploads hard_delete',
			details: { batches, cleaned: totalCleaned, orphansRemoved },
			entityType: 'file_uploads',
		});
	}

	return { batches, cleaned: totalCleaned };
}

/**
 * Sweep orphaned blobs from the local uploads directory: files present on disk
 * with no matching file_uploads row (by storagePath or thumbnailKey) that are
 * older than 24h — leftovers from crashed uploads or failed DB inserts.
 *
 * Local adapter only; the 24h grace period protects in-flight uploads.
 * @param db - Database handle used to look up file_uploads rows.
 * @returns Number of orphaned files removed.
 */
async function cleanupOrphanedUploads(db: ReturnType<typeof getDb>): Promise<number> {
	const config = getConfig();
	if (config.storage.adapter !== 'local' || !existsSync(UPLOAD_DIR)) return 0;

	const cutoffMs = Date.now() - ORPHAN_MIN_AGE_MS;
	const entries = await readdir(UPLOAD_DIR, { recursive: true });
	const candidates: { key: string; path: string }[] = [];

	for (const entry of entries) {
		const relPath = entry.toString();
		const filePath = join(UPLOAD_DIR, relPath);
		const stats = await stat(filePath).catch(() => null);
		if (!stats?.isFile() || stats.mtimeMs > cutoffMs) continue;
		// Storage keys always use forward slashes (see services/file/upload.ts)
		candidates.push({ key: relPath.replaceAll('\\', '/'), path: filePath });
	}

	let removed = 0;
	for (let i = 0; i < candidates.length; i += MAX_CLEANUP_BATCH_SIZE) {
		const batch = candidates.slice(i, i + MAX_CLEANUP_BATCH_SIZE);
		const keys = batch.map((c) => c.key);
		const known = db
			.select({
				storagePath: fileUploads.storagePath,
				thumbnailKey: fileUploads.thumbnailKey,
			})
			.from(fileUploads)
			.where(
				or(inArray(fileUploads.storagePath, keys), inArray(fileUploads.thumbnailKey, keys))
			)
			.all();

		const knownKeys = new Set<string>();
		for (const row of known) {
			knownKeys.add(row.storagePath);
			if (row.thumbnailKey) knownKeys.add(row.thumbnailKey);
		}

		for (const candidate of batch) {
			if (knownKeys.has(candidate.key)) continue;
			try {
				await unlink(candidate.path);
				removed++;
			} catch {
				logScheduler('warn', 'Failed to delete orphaned upload file', {
					key: candidate.key,
				});
			}
		}
	}

	if (removed > 0) {
		logScheduler('info', 'Orphaned upload files removed from local storage', { removed });
	}

	return removed;
}

async function safeStorageDelete(
	storage: ReturnType<typeof getStorageAdapter>,
	key: string
): Promise<boolean> {
	try {
		await storage.delete(key);
		return true;
	} catch {
		logScheduler('warn', 'Failed to delete file from storage', { key });
		return false;
	}
}

export { softDeletedFilesCleanupTask };

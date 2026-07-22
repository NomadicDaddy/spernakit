import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import type { FileRecord } from './types.ts';

import { ISO_DATE_SLICE_LENGTH } from '../../constants/files.ts';
import { getDb } from '../../db/index.ts';
import { fileUploads } from '../../db/schema/fileUploads.ts';
import { getStorageAdapter } from '../../storage/index.ts';
import { logger } from '../../utils/logger.ts';
import { generateThumbnail, isProcessableImage } from '../imageService.ts';
import { FileValidationError, mapFileToRecord } from './types.ts';
import { normalizeMimeType, validateExtension, validateFile } from './validation.ts';

const MAX_FILENAME_LENGTH = 255;

interface UploadInput {
	data: Buffer;
	mimeType: string;
	originalName: string;
	size: number;
	uploadedBy: number;
	workspaceId?: number;
}

/**
 * Sanitize an original filename to prevent stored XSS and path traversal.
 * Allows alphanumeric, dashes, underscores, dots, spaces, and parentheses.
 *
 * @param name - Raw filename from upload
 * @returns Sanitized filename
 */
function sanitizeFilename(name: string): string {
	return name
		.replace(/[^\w\s.\-()]/g, '_')
		.replace(/_{2,}/g, '_')
		.slice(0, MAX_FILENAME_LENGTH);
}

/**
 * Upload a file: validate, store on disk, and create database record.
 *
 * @param input - Upload parameters
 * @returns Created file record
 */
async function upload(input: UploadInput): Promise<FileRecord> {
	const sanitizedName = sanitizeFilename(input.originalName);
	const normalizedMimeType = normalizeMimeType(input.mimeType);
	const validationError = validateFile(input.mimeType, input.size, input.data);
	if (validationError) {
		throw new FileValidationError(validationError);
	}

	const ext = extname(sanitizedName) || '';
	const extensionError = validateExtension(ext, normalizedMimeType);
	if (extensionError) {
		throw new FileValidationError(extensionError);
	}

	const filename = `${randomUUID()}${ext}`;
	const storageKey = `${new Date().toISOString().slice(0, ISO_DATE_SLICE_LENGTH)}/${filename}`;

	const storage = getStorageAdapter();

	// Run storage write and thumbnail generation in parallel
	const thumbnailPromise = isProcessableImage(normalizedMimeType)
		? generateThumbnail(input.data)
		: Promise.resolve(null);
	const [, thumbnail] = await Promise.all([
		storage.write(storageKey, input.data),
		thumbnailPromise,
	]);

	let thumbnailKey: null | string = null;
	if (thumbnail) {
		thumbnailKey = `${new Date().toISOString().slice(0, ISO_DATE_SLICE_LENGTH)}/thumb_${randomUUID()}.webp`;
		await storage.write(thumbnailKey, thumbnail);
	}

	const db = getDb();
	try {
		const result = db
			.insert(fileUploads)
			.values({
				filename,
				mimeType: normalizedMimeType,
				originalName: sanitizedName,
				size: input.size,
				storagePath: storageKey,
				...(thumbnailKey ? { thumbnailKey } : {}),
				uploadedBy: input.uploadedBy,
				...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
			})
			.returning({
				createdAt: fileUploads.createdAt,
				filename: fileUploads.filename,
				id: fileUploads.id,
				mimeType: fileUploads.mimeType,
				originalName: fileUploads.originalName,
				size: fileUploads.size,
				thumbnailKey: fileUploads.thumbnailKey,
				uploadedBy: fileUploads.uploadedBy,
				workspaceId: fileUploads.workspaceId,
			})
			.get();

		return mapFileToRecord(result);
	} catch (err) {
		// Clean up orphaned storage files on DB insert failure
		try {
			await storage.delete(storageKey);
			if (thumbnailKey) {
				await storage.delete(thumbnailKey);
			}
		} catch (err) {
			logger.error(
				{ err, storageKey, thumbnailKey },
				'Failed to clean up orphaned storage files after DB insert failure'
			);
		}
		throw err;
	}
}

export { upload };

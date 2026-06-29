/** Database file row shape used as input for mapping to FileRecord. */
interface FileRow {
	createdAt: Date;
	filename: string;
	id: number;
	mimeType: string;
	originalName: string;
	size: number;
	thumbnailKey: null | string;
	uploadedBy: null | number;
	workspaceId: null | number;
}

/** API-facing file record returned to consumers. */
interface FileRecord {
	createdAt: string;
	filename: string;
	id: number;
	mimeType: string;
	originalName: string;
	size: number;
	thumbnailKey: null | string;
	/** User ID who uploaded the file. Null if user has been deleted. */
	uploadedBy: null | number;
	workspaceId: null | number;
}

/** Error thrown for user-facing file validation failures (safe to return in API response). */
class FileValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FileValidationError';
	}
}

/**
 * Map a database file row to an API-facing FileRecord.
 *
 * @param file - Database file row
 * @returns Mapped file record with ISO date string
 */
function mapFileToRecord(file: FileRow): FileRecord {
	return {
		createdAt: file.createdAt.toISOString(),
		filename: file.filename,
		id: file.id,
		mimeType: file.mimeType,
		originalName: file.originalName,
		size: file.size,
		thumbnailKey: file.thumbnailKey,
		uploadedBy: file.uploadedBy,
		workspaceId: file.workspaceId,
	};
}

export type { FileRecord, FileRow };
export { FileValidationError, mapFileToRecord };

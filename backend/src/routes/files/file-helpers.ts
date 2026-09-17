import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { BYTES_PER_MB } from '../../constants/files.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { hasMinimumRole, isSysop } from '../../guards/role.ts';
import { getById } from '../../services/fileService.ts';
import { trackEvent } from '../../services/metricsService.ts';
import {
	badRequestError,
	type ErrorResponse,
	forbiddenError,
	notFoundError,
} from '../../utils/errorResponse.ts';

/* ------------------------------------------------------------------ */
/*  Workspace scope validation helper                                  */
/* ------------------------------------------------------------------ */

/**
 * The workspace a file lookup is scoped to, or undefined for a lookup across every workspace.
 *
 * The scope follows the header, not the caller: an id that was sent is always honoured, and only
 * its absence opens the cross-workspace lookup. Who is allowed to make that lookup was already
 * settled by {@link validateWorkspaceScope}, which refuses a missing header for everyone but a
 * SYSOP. Reading the role again here is what used to discard a workspace a SYSOP had deliberately
 * named and answer with every workspace's files instead.
 *
 * @param workspaceId - The id the request's workspace header carried, or null when it sent none.
 * @returns The workspace to scope to, or undefined to look across all of them.
 */
function scopedWorkspaceId(workspaceId: null | number): null | number | undefined {
	return workspaceId ?? undefined;
}

/* ------------------------------------------------------------------ */
/*  File ownership check                                               */
/* ------------------------------------------------------------------ */

/**
 * Check if a user can access a specific file (owner or ADMIN+).
 * Returns a 403 error response if denied, or null if access is allowed.
 */
function checkFileOwnership({
	file,
	set,
	user,
}: {
	file: { uploadedBy: null | number };
	set: { status?: number | string };
	user: AuthPayload;
}): ErrorResponse | null {
	if (isSysop(user)) return null;
	if (hasMinimumRole(user.role, 'ADMIN')) return null;
	if (file.uploadedBy === user.id) return null;

	set.status = HTTP_STATUS.FORBIDDEN;
	return forbiddenError('You can only access files you uploaded');
}

/* ------------------------------------------------------------------ */
/*  File upload validation and tracking helpers                        */
/* ------------------------------------------------------------------ */

function validateUploadedFile(
	file: File | undefined,
	set: { status?: number | string },
): ErrorResponse | null {
	if (!file) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('No file provided');
	}

	const { maxFileSize } = getConfig().storage;
	if (file.size > maxFileSize) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		const maxMb = Math.round(maxFileSize / BYTES_PER_MB);
		return badRequestError(`File exceeds maximum size of ${maxMb}MB`);
	}

	return null;
}

function trackUploadEvent(file: File, userId: number, workspaceId: null | number): void {
	trackEvent({
		eventCategory: 'feature_usage',
		eventName: 'file_uploaded',
		metadata: { mimeType: file.type, size: file.size },
		userId,
		...(workspaceId ? { workspaceId } : {}),
	});
}

/* ------------------------------------------------------------------ */
/*  Shared file resolution                                             */
/* ------------------------------------------------------------------ */

type FileRecord = NonNullable<ReturnType<typeof getById>>;

/**
 * Look up a file by ID with workspace scope and check ownership.
 * Returns the file record or an error response.
 */
function resolveFileWithAccess({
	fileId,
	set,
	user,
	workspaceId,
}: {
	fileId: number;
	set: { status?: number | string };
	user: AuthPayload;
	workspaceId: null | number;
}): { error: false; file: FileRecord } | { error: true; response: ErrorResponse } {
	const file = getById(fileId, scopedWorkspaceId(workspaceId));
	if (!file) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return { error: true, response: notFoundError('File') };
	}

	const ownershipCheck = checkFileOwnership({ file, set, user });
	if (ownershipCheck) return { error: true, response: ownershipCheck };

	return { error: false, file };
}

export { resolveFileWithAccess, scopedWorkspaceId, trackUploadEvent, validateUploadedFile };
export type { FileRecord };

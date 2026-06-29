import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { BYTES_PER_MB } from '../../constants/files.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser, hasMinimumRole, isSysop } from '../../guards/role.ts';
import { requireWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { getById } from '../../services/fileService.ts';
import { trackEvent } from '../../services/metricsService.ts';
import {
	type ErrorResponse,
	badRequestError,
	forbiddenError,
	notFoundError,
} from '../../utils/errorResponse.ts';

/* ------------------------------------------------------------------ */
/*  Workspace scope validation helper                                  */
/* ------------------------------------------------------------------ */

type WorkspaceGuardResult = { error: true; response: object } | null;

function validateWorkspaceScope({
	set,
	user,
	workspaceId,
}: {
	set: { status?: number | string };
	user: AuthPayload;
	workspaceId: null | number;
}): WorkspaceGuardResult {
	const userIsSysop = isSysop(user);

	if (!userIsSysop && !workspaceId) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return {
			error: true,
			response: badRequestError('X-Workspace-Id header is required for file operations'),
		};
	}

	if (workspaceId) {
		const guard = requireWorkspaceAccess({ set, user, workspaceId });
		if (guard) return { error: true, response: guard };
	}

	return null;
}

/**
 * Returns workspaceId for non-SYSOP users, undefined for SYSOP (cross-workspace access).
 */
function scopedWorkspaceId(
	user: AuthPayload,
	workspaceId: null | number
): null | number | undefined {
	return !isSysop(user) ? workspaceId : undefined;
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
	set: { status?: number | string }
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
	const file = getById(fileId, scopedWorkspaceId(user, workspaceId));
	if (!file) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return { error: true, response: notFoundError('File') };
	}

	const ownershipCheck = checkFileOwnership({ file, set, user });
	if (ownershipCheck) return { error: true, response: ownershipCheck };

	return { error: false, file };
}

/**
 * Assert auth user and validate workspace scope in one call.
 * Combines assertUser + validateWorkspaceScope to reduce handler boilerplate.
 */
function assertFileContext(
	user: AuthPayload | null,
	workspaceId: null | number,
	set: { status?: number | string }
): { authUser: AuthPayload; ok: true } | { error: object; ok: false } {
	const authUser = assertUser(user);
	const scopeCheck = validateWorkspaceScope({ set, user: authUser, workspaceId });
	if (scopeCheck) return { error: scopeCheck.response, ok: false };
	return { authUser, ok: true };
}

export {
	assertFileContext,
	resolveFileWithAccess,
	scopedWorkspaceId,
	trackUploadEvent,
	validateUploadedFile,
	validateWorkspaceScope,
};
export type { FileRecord };

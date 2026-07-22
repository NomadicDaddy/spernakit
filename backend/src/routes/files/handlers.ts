import { WS_CRUD_EVENTS } from 'spernakit-shared';

import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { hasMinimumRole, isSysop } from '../../guards/role.ts';
import {
	FileValidationError,
	download,
	list,
	softDelete,
	upload,
} from '../../services/fileService.ts';
import { broadcastCrudToUser, broadcastCrudToWorkspace } from '../../services/websocketService.ts';
import { dataResponse, paginatedResponse, successResponse } from '../../utils/apiResponse.ts';
import { badRequestError, internalError, notFoundError } from '../../utils/errorResponse.ts';
import {
	assertFileContext,
	resolveFileWithAccess,
	scopedWorkspaceId,
	trackUploadEvent,
	validateUploadedFile,
} from './file-helpers.ts';

/* ------------------------------------------------------------------ */
/*  Extracted handlers                                                 */
/* ------------------------------------------------------------------ */

async function handleUploadFile({
	body,
	set,
	user,
	workspaceId,
}: {
	body: { file: File };
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	const ctx = assertFileContext(user, workspaceId, set);
	if (!ctx.ok) return ctx.error;

	const fileError = validateUploadedFile(body.file, set);
	if (fileError) return fileError;

	const file = body.file;

	const arrayBuffer = await file.arrayBuffer();
	const fileBuffer = Buffer.from(arrayBuffer);

	try {
		const record = await upload({
			data: fileBuffer,
			mimeType: file.type,
			originalName: file.name,
			size: file.size,
			uploadedBy: ctx.authUser.id,
			...(workspaceId ? { workspaceId } : {}),
		});

		trackUploadEvent(file, ctx.authUser.id, workspaceId);

		if (workspaceId) {
			broadcastCrudToWorkspace(workspaceId, WS_CRUD_EVENTS.FILE_CREATED, { id: record.id });
		} else {
			broadcastCrudToUser(ctx.authUser.id, WS_CRUD_EVENTS.FILE_CREATED, { id: record.id });
		}

		set.status = HTTP_STATUS.CREATED;
		return dataResponse(record);
	} catch (err) {
		if (err instanceof FileValidationError) {
			set.status = HTTP_STATUS.BAD_REQUEST;
			return badRequestError(err.message);
		}
		set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
		return internalError();
	}
}

async function handleDownloadFile({
	params,
	set,
	user,
	workspaceId,
}: {
	params: { id: number };
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	const ctx = assertFileContext(user, workspaceId, set);
	if (!ctx.ok) return ctx.error;

	const resolved = resolveFileWithAccess({
		fileId: params.id,
		set,
		user: ctx.authUser,
		workspaceId,
	});
	if (resolved.error) return resolved.response;

	const result = await download(params.id, scopedWorkspaceId(ctx.authUser, workspaceId));
	if (!result) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('File');
	}

	const sanitizedFilename = result.filename.replace(/["\\/\r\n]/g, '_');
	const allowedMimes = getConfig().storage.allowedMimeTypes;
	const safeMimeType = allowedMimes.includes(result.mimeType)
		? result.mimeType
		: 'application/octet-stream';
	set.headers['content-type'] = safeMimeType;
	set.headers['content-disposition'] = `attachment; filename="${sanitizedFilename}"`;
	set.headers['x-content-type-options'] = 'nosniff';
	return new Response(new Uint8Array(result.data));
}

function handleGetFileInfo({
	params,
	set,
	user,
	workspaceId,
}: {
	params: { id: number };
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	const ctx = assertFileContext(user, workspaceId, set);
	if (!ctx.ok) return ctx.error;

	const resolved = resolveFileWithAccess({
		fileId: params.id,
		set,
		user: ctx.authUser,
		workspaceId,
	});
	if (resolved.error) return resolved.response;

	return dataResponse(resolved.file);
}

function handleListFiles({
	query,
	set,
	user,
	workspaceId,
}: {
	query: { limit?: number; page?: number };
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	const ctx = assertFileContext(user, workspaceId, set);
	if (!ctx.ok) return ctx.error;
	const limit = query.limit;
	const page = query.page;

	const isPrivileged = isSysop(ctx.authUser) || hasMinimumRole(ctx.authUser.role, 'ADMIN');

	const result = list({
		limit,
		page,
		uploadedBy: isPrivileged ? undefined : ctx.authUser.id,
		workspaceId: scopedWorkspaceId(ctx.authUser, workspaceId),
	});

	return paginatedResponse(result);
}

function handleDeleteFile({
	params,
	set,
	user,
	workspaceId,
}: {
	params: { id: number };
	set: { status?: number | string };
	user: AuthPayload | null;
	workspaceId: null | number;
}) {
	const ctx = assertFileContext(user, workspaceId, set);
	if (!ctx.ok) return ctx.error;

	const resolved = resolveFileWithAccess({
		fileId: params.id,
		set,
		user: ctx.authUser,
		workspaceId,
	});
	if (resolved.error) return resolved.response;

	softDelete(params.id, ctx.authUser.id, scopedWorkspaceId(ctx.authUser, workspaceId));

	if (workspaceId) {
		broadcastCrudToWorkspace(workspaceId, WS_CRUD_EVENTS.FILE_DELETED, { id: params.id });
	} else {
		broadcastCrudToUser(ctx.authUser.id, WS_CRUD_EVENTS.FILE_DELETED, { id: params.id });
	}

	return successResponse();
}

export {
	handleDeleteFile,
	handleDownloadFile,
	handleGetFileInfo,
	handleListFiles,
	handleUploadFile,
};

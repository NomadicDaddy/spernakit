import { Elysia } from 'elysia';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { badRequestError, VALIDATION_ERROR_CODES } from '../utils/errorResponse.ts';
import { parseWorkspaceId } from '../utils/validation.ts';

/**
 * Elysia plugin that extracts workspaceId from the X-Workspace-ID header.
 * Derives a numeric workspaceId (or null) available to all downstream handlers,
 * and rejects a header that was sent but cannot be read as a workspace id.
 */
const workspacePlugin = new Elysia({ name: 'workspace' })
	.derive({ as: 'scoped' }, ({ request }) => {
		const headerValue = request.headers.get('x-workspace-id');
		return {
			workspaceId: parseWorkspaceId(headerValue ?? undefined),
			workspaceIdHeader: headerValue,
		};
	})
	/*
	 * A header that is present but unreadable is a client error, and answering it here is the
	 * only place that can tell it apart from no header at all. `parseWorkspaceId` returns null
	 * for both, and every downstream guard sees only that null: it reported "Missing
	 * X-Workspace-ID header" for `abc` and `-1` as readily as for an omitted header, so a client
	 * sending a malformed id was told to send one it was already sending.
	 *
	 * Rejecting it also closes the more consequential half. Null means "no workspace selected",
	 * which for a SYSOP is the cross-workspace view, so `X-Workspace-ID: abc` from a SYSOP
	 * silently returned every workspace's rows instead of the one that was asked for.
	 *
	 * An empty or whitespace-only value counts as absent rather than malformed. It is what a
	 * client that builds headers unconditionally sends when nothing is selected, and treating it
	 * as an error would reject requests that are asking for exactly what null means.
	 *
	 * The value is not echoed back. The message says what a workspace id has to look like, which
	 * is the part the caller does not already have.
	 */
	.onBeforeHandle({ as: 'scoped' }, ({ set, workspaceId, workspaceIdHeader }) => {
		if (workspaceIdHeader === null || workspaceIdHeader.trim() === '') return;
		if (workspaceId !== null) return;

		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(
			'Invalid X-Workspace-ID header: expected a positive integer',
			VALIDATION_ERROR_CODES.VALIDATION_INVALID_FORMAT,
		);
	});

export { workspacePlugin };

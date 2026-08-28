/**
 * The workspace header precondition, in one place.
 *
 * Every route that works inside a workspace reads the same header, and before this module each one
 * answered a missing header its own way. The workspace guards reported it as a missing header; the
 * file routes reported it as a header required for file operations, and spelled the header name
 * with a lower-case final letter that neither the CORS allow-list nor the frontend client used. A
 * caller who copied the spelling out of the message was sending a header the server would not read.
 *
 * Three rules live here, and nothing else may restate them:
 *
 * 1. ONE NAME. `WORKSPACE_HEADER` is the spelling the CORS allow-list publishes, the spelling
 *    `frontend/src/api/requestHelpers.ts` sends, and the spelling every message names. Prose in
 *    an OpenAPI description spells it the same way.
 * 2. ONE ANSWER. A missing header is 400 with one message, wherever the precondition is checked.
 *    A header that was sent but cannot be read as a workspace id is a different failure and gets
 *    its own message, because telling a caller to send a header they are already sending is the
 *    one reply that cannot help them.
 * 3. ONE ORDER. Authentication, then the caller's global role, then the header, then workspace
 *    membership. The first two are route options the auth plugin runs at the transform stage, so
 *    they are decided before any handler or `beforeHandle` guard runs and a caller who fails both
 *    the role check and the header check always hears about the role. Nothing here may be moved
 *    ahead of them, and a route must not check the header from a place that runs earlier.
 *
 * The scope rule that follows from them is not a function because it is not a decision: a request
 * is scoped to the workspace its header named, whoever sent it. Only a request that named no
 * workspace gets the cross-workspace view, and only a SYSOP is allowed to make one. Writing
 * `!isSysop(user) && workspaceId` instead reads as a permission check but silently discarded an
 * id a SYSOP had deliberately supplied, so a SYSOP who narrowed a listing to one workspace
 * received every workspace instead. `scripts/test-workspace-header-contract.ts` fails on that
 * shape wherever it reappears.
 */
import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { getById as getWorkspaceById } from '../services/workspaceService.ts';
import {
	badRequestError,
	type ErrorResponse,
	notFoundError,
	VALIDATION_ERROR_CODES,
} from '../utils/errorResponse.ts';

/** The one spelling of the workspace header: CORS publishes it, the client sends it, messages name it. */
const WORKSPACE_HEADER = 'X-Workspace-ID';

/** The one message for a header that was not sent. */
const MISSING_WORKSPACE_HEADER = `Missing ${WORKSPACE_HEADER} header`;

/** The one message for a header that was sent and could not be read. */
const INVALID_WORKSPACE_HEADER = `Invalid ${WORKSPACE_HEADER} header: expected a positive integer`;

/** The part of an Elysia context these helpers write, which is only the status. */
interface StatusSink {
	status?: number | string;
}

/**
 * Answer a request that did not send the workspace header.
 *
 * @param set - The context's status sink, set to 400.
 * @returns The error body to return from the guard or handler.
 */
function missingWorkspaceHeaderError(set: StatusSink): ErrorResponse {
	set.status = HTTP_STATUS.BAD_REQUEST;
	return badRequestError(MISSING_WORKSPACE_HEADER);
}

/**
 * Answer a request whose workspace header could not be read as a workspace id.
 *
 * The value is not echoed back. The message says what a workspace id has to look like, which is
 * the part the caller does not already have.
 *
 * @param set - The context's status sink, set to 400.
 * @returns The error body to return from the guard or handler.
 */
function invalidWorkspaceHeaderError(set: StatusSink): ErrorResponse {
	set.status = HTTP_STATUS.BAD_REQUEST;
	return badRequestError(
		INVALID_WORKSPACE_HEADER,
		VALIDATION_ERROR_CODES.VALIDATION_INVALID_FORMAT,
	);
}

/**
 * Answer a request naming a workspace that does not exist, in the header or in the path.
 *
 * A caller reaches this only after passing the access check for the workspace they named. Everyone
 * else is answered by the membership check first, and that check deliberately does not distinguish
 * a workspace they cannot reach from one that is not there, so this status can never be used to
 * learn which ids are real. A SYSOP can reach every workspace, so for them a named workspace that
 * is absent is a plain not-found rather than a broader result, or an empty one, returned in its
 * place. `guards/workspaceAccess.ts` asks the same question of a workspace named in the path, once
 * per guard and after the access decision, so every route that runs a guard gets this answer
 * without carrying a lookup of its own.
 *
 * @param set - The context's status sink, set to 404.
 * @returns The error body to return from the guard.
 */
function unknownWorkspaceError(set: StatusSink): ErrorResponse {
	set.status = HTTP_STATUS.NOT_FOUND;
	return notFoundError('Workspace');
}

/**
 * Whether a workspace exists and has not been deleted.
 *
 * @param workspaceId - The id the header named.
 * @returns True when the workspace is present.
 */
function workspaceExists(workspaceId: number): boolean {
	return getWorkspaceById(workspaceId) !== null;
}

export {
	INVALID_WORKSPACE_HEADER,
	invalidWorkspaceHeaderError,
	MISSING_WORKSPACE_HEADER,
	missingWorkspaceHeaderError,
	unknownWorkspaceError,
	WORKSPACE_HEADER,
	workspaceExists,
};

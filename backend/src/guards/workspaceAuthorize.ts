/**
 * Transform-stage wrappers around the workspace guards in `workspaceAccess.ts`.
 *
 * Each function here answers the same question its guard already answers and adds one thing:
 * it raises the refusal instead of returning it. Elysia ignores a value returned from a
 * transform hook, so a guard that has to stop a request before its schema runs has to throw.
 * The policy stays in the guard; only the raising lives here.
 */
import type { AuthPayload } from '../plugins/auth.ts';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { PreValidationRejection } from '../utils/preValidationRejection.ts';
import {
	requireSelectedWorkspaceAccess,
	requireWorkspaceAccess,
	requireWorkspaceRole,
	type WorkspaceGuardContext,
} from './workspaceAccess.ts';

/**
 * Run the selected-workspace guard and throw its rejection instead of returning it.
 *
 * The mirror of `authorizeRequest` in `guards/role.ts`, and here for the same reason. Elysia
 * ignores a value returned from a transform hook, so a guard that has to stop the request before
 * validation must raise its rejection rather than return it. Routes carrying this guard in
 * `beforeHandle` ran it after the body and query had already been checked, so a caller with no
 * access to the selected workspace who sent a malformed query was answered 400 with the query's
 * constraints instead of the 403 the route owed them.
 *
 * The policy stays in {@link requireSelectedWorkspaceAccess}; this adds only the raising, so there
 * is one definition of what access to the selected workspace means.
 *
 * @param ctx - The request context, carrying the derived user, the workspace id and `set`.
 * @throws PreValidationRejection when the caller may not read the selected workspace.
 */
function authorizeSelectedWorkspace(ctx: WorkspaceGuardContext): void {
	const rejection = requireSelectedWorkspaceAccess(ctx);
	if (!rejection) return;

	const status = typeof ctx.set.status === 'number' ? ctx.set.status : HTTP_STATUS.FORBIDDEN;
	throw new PreValidationRejection(status, rejection);
}

/**
 * Run the selected-workspace guard only when the request named a workspace.
 *
 * For routes where the selected workspace is optional rather than required. Creating a
 * notification is the case this exists for: a notification with no workspace is the caller's own,
 * which anyone may create, but one addressed to a workspace has to be a workspace the caller can
 * reach. The route read the header, checked it inside the handler, and so checked it after the
 * body had already been validated.
 *
 * The difference from {@link authorizeSelectedWorkspace} is only what an absent header means. There
 * it is a cross-workspace request, which is a SYSOP's to make and nobody else's; here it means no
 * workspace is involved at all, so there is nothing to authorize.
 *
 * @param ctx - The request context, carrying the derived user, the workspace id and `set`.
 * @throws PreValidationRejection when a workspace was named and the caller may not reach it.
 */
function authorizeSelectedWorkspaceIfSent(ctx: WorkspaceGuardContext): void {
	if (ctx.workspaceId === null) return;

	authorizeSelectedWorkspace(ctx);
}

/**
 * Run the workspace-ADMIN guard for a `:id` route parameter and throw its rejection.
 *
 * The sibling of {@link authorizeSelectedWorkspace}, for routes that name their workspace in the
 * path instead of the selected-workspace header. Those routes called {@link requireWorkspaceRole}
 * from inside the handler, which is after Elysia has validated the body, so a caller with no admin
 * rights on the workspace who sent a malformed body was told what was wrong with the body instead
 * of being refused. Every one of them takes a body, so every one of them had the defect.
 *
 * `params.id` is still the raw path string here: `t.Numeric` coerces at the validation stage,
 * which has not run yet. An id that is not a positive integer is left alone deliberately, because
 * that is a validation question and not an authorization one; the schema answers it a moment later
 * and the request reaches no handler either way.
 *
 * @param ctx - The request context, carrying the derived user, the raw path params and `set`.
 * @throws PreValidationRejection when the caller is not an admin of the named workspace.
 */
function authorizeWorkspaceAdminParam(ctx: {
	params: Record<string, unknown>;
	set: { status?: number | string };
	user?: AuthPayload | null;
}): void {
	const workspaceId = Number(ctx.params.id);
	if (!Number.isInteger(workspaceId) || workspaceId < 1) return;

	const rejection = requireWorkspaceRole(
		{ set: ctx.set, user: ctx.user ?? null, workspaceId },
		'ADMIN',
	);
	if (!rejection) return;

	const status = typeof ctx.set.status === 'number' ? ctx.set.status : HTTP_STATUS.FORBIDDEN;
	throw new PreValidationRejection(status, rejection);
}

/**
 * Run the workspace-membership guard for a `:id` route parameter and throw its rejection.
 *
 * The read-side sibling of {@link authorizeWorkspaceAdminParam}: same path parameter, same raising,
 * but membership rather than the ADMIN role, for routes that only read the workspace they name.
 * Those routes asked the question from inside the handler, which left the answer downstream of
 * whatever the route validates. Neither of them carries a body today, so nothing was leaking, and
 * that is exactly why they were worth moving: a guard that lives in the handler becomes a defect
 * the day someone gives the route a body, and nothing in the route says so.
 *
 * As with the admin guard, `params.id` is still the raw path string here and an id that is not a
 * positive integer is left for the schema to answer a moment later.
 *
 * @param ctx - The request context, carrying the derived user, the raw path params and `set`.
 * @throws PreValidationRejection when the caller is not a member of the named workspace.
 */
function authorizeWorkspaceMemberParam(ctx: {
	params: Record<string, unknown>;
	set: { status?: number | string };
	user?: AuthPayload | null;
}): void {
	const workspaceId = Number(ctx.params.id);
	if (!Number.isInteger(workspaceId) || workspaceId < 1) return;

	const rejection = requireWorkspaceAccess({ set: ctx.set, user: ctx.user ?? null, workspaceId });
	if (!rejection) return;

	const status = typeof ctx.set.status === 'number' ? ctx.set.status : HTTP_STATUS.FORBIDDEN;
	throw new PreValidationRejection(status, rejection);
}
export {
	authorizeSelectedWorkspace,
	authorizeSelectedWorkspaceIfSent,
	authorizeWorkspaceAdminParam,
	authorizeWorkspaceMemberParam,
};

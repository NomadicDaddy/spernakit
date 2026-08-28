import { Elysia } from 'elysia';

import {
	authorizeSelectedWorkspace,
	type WorkspaceGuardContext,
} from '../guards/workspaceAccess.ts';
import { invalidWorkspaceHeaderError } from '../guards/workspaceHeader.ts';
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
	 * The reply itself comes from `guards/workspaceHeader.ts`, which owns every message about
	 * this header so a caller cannot be told two different things about the same one.
	 */
	.onBeforeHandle({ as: 'scoped' }, ({ set, workspaceId, workspaceIdHeader }) => {
		if (workspaceIdHeader === null || workspaceIdHeader.trim() === '') return;
		if (workspaceId !== null) return;

		return invalidWorkspaceHeaderError(set);
	})
	/**
	 * A route option that rejects a caller with no access to the selected workspace.
	 *
	 * The hook runs at the transform stage, the same stage `requireAuth` and `requireRole` run at
	 * and the stage before Elysia validates the request against the route's schema. Routes that
	 * carried this check in `beforeHandle` ran it after the body and query had already been
	 * checked, so a caller who may not read the selected workspace and sent a malformed query was
	 * answered 400 with that query's constraints instead of the 403 the route owed them.
	 *
	 * It lives on this plugin rather than on `authPlugin` because the check reads workspace
	 * membership from the database, and `user` is already in scope here: a scoped derive runs
	 * ahead of a per-route macro transform, so both `user` and `workspaceId` are set by the time
	 * this runs even though the auth plugin is applied separately.
	 *
	 * A transform hook cannot short-circuit by returning, so `authorizeSelectedWorkspace` throws;
	 * the `onError` handler in create-api-app.ts turns that into the same 401 or 403 envelope the
	 * `beforeHandle` form produced.
	 */
	.macro({
		// Elysia types a macro's transform context with the derived fields optional and readonly,
		// because a macro is declared without knowing which instances the scoped derives above
		// reached. Both are set at runtime, which the cast states rather than widening
		// WorkspaceGuardContext for a case that cannot occur.
		requireSelectedWorkspace: (enabled: boolean) => ({
			transform(ctx) {
				if (enabled) authorizeSelectedWorkspace(ctx as unknown as WorkspaceGuardContext);
			},
		}),
	});

export { workspacePlugin };

import { Elysia, t } from 'elysia';

import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser, requireAuth, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin, parseCookies, signAccessToken } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { getUserAuthStatus, getUserById } from '../../services/userService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import { isSecureCookie } from '../../utils/auth/authHelpers.ts';
import { revokeAccessToken } from '../../utils/auth/tokenBlacklist.ts';
import { badRequestError, forbiddenError, notFoundError } from '../../utils/errorResponse.ts';

/* ------------------------------------------------------------------ */
/*  Extracted handlers                                                 */
/* ------------------------------------------------------------------ */

function handleStartImpersonate({
	params,
	request,
	set,
	user,
}: {
	params: { id: number };
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const targetId = Number(params.id);
	const config = getConfig();

	// Self-impersonation guard — check BEFORE any cookie mutation
	if (targetId === authUser.id) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Cannot impersonate yourself');
	}

	// Re-impersonation guard
	if (authUser.impersonatedBy) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Already impersonating another user');
	}

	// Verify target exists
	const targetUser = getUserById(targetId);
	if (!targetUser) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('User');
	}

	// Issue a new access token for the target with impersonatedBy claim
	const impersonationToken = signAccessToken({
		id: targetUser.id,
		impersonatedBy: authUser.id,
		role: targetUser.role,
	});

	// Read the current access token from cookies to stash it
	const cookieHeader = request.headers.get('cookie') ?? '';
	const cookies = parseCookies(cookieHeader);
	const currentAccessToken = cookies[config.security.authCookieName] ?? '';

	// Build cookie headers
	const secure = isSecureCookie() ? '; Secure' : '';
	const maxAge = Math.floor(config.security.cookieMaxAge / 1000);
	const stashCookieName = `${config.security.authCookieName}_imp_orig`;

	const authCookie = `${config.security.authCookieName}=${encodeURIComponent(impersonationToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
	const stashCookie = `${stashCookieName}=${encodeURIComponent(currentAccessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;

	// Set both cookies atomically
	(set.headers as Record<string, string | string[]>)['set-cookie'] = [authCookie, stashCookie];

	// Audit log
	logAudit({
		action: 'user.impersonate.start',
		details: { targetUserId: targetId },
		entityId: String(targetId),
		entityType: 'user',
		userId: authUser.id,
	});

	return successResponse();
}

function handleStopImpersonate({
	request,
	set,
	user,
}: {
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const config = getConfig();

	if (!authUser.impersonatedBy) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Not currently impersonating anyone');
	}

	// Verify the original impersonator is still a SYSOP (fresh DB lookup) —
	// the session token carries the TARGET's role, so requireRoleFresh('SYSOP')
	// cannot be used as the route guard here.
	const impersonator = getUserAuthStatus(authUser.impersonatedBy);
	if (!impersonator || impersonator.isDeleted || impersonator.role !== 'SYSOP') {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError('Original impersonator is no longer authorized');
	}

	// Read the stashed original token from _imp_orig cookie
	const cookieHeader = request.headers.get('cookie') ?? '';
	const cookies = parseCookies(cookieHeader);
	const stashCookieName = `${config.security.authCookieName}_imp_orig`;
	const stashedToken = cookies[stashCookieName];

	if (!stashedToken) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Original session token not found. Please log out and log back in.');
	}

	// Revoke the current impersonation access token
	const currentAccessToken = cookies[config.security.authCookieName];
	if (currentAccessToken) {
		// Revoke with a 1-hour window — the token will naturally expire anyway.
		// revokeAccessToken expects a Unix timestamp in SECONDS (from JWT exp).
		revokeAccessToken(currentAccessToken, Math.floor(Date.now() / 1000) + 3600, authUser.id);
	}

	// Restore the stashed token as the auth cookie
	const secure = isSecureCookie() ? '; Secure' : '';
	const maxAge = Math.floor(config.security.cookieMaxAge / 1000);
	const authCookie = `${config.security.authCookieName}=${encodeURIComponent(stashedToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
	const clearStashCookie = `${stashCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;

	(set.headers as Record<string, string | string[]>)['set-cookie'] = [
		authCookie,
		clearStashCookie,
	];

	// Audit log
	logAudit({
		action: 'user.impersonate.stop',
		details: { originalUserId: authUser.impersonatedBy },
		entityId: String(authUser.impersonatedBy),
		entityType: 'user',
		userId: authUser.impersonatedBy,
	});

	return successResponse();
}

const usersImpersonateRoutes = new Elysia({
	detail: { tags: ['Users'] },
	prefix: '/users',
})
	.use(authPlugin)
	.post('/:id/impersonate', handleStartImpersonate, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description:
				'Start impersonating another user (SYSOP only). Issues a new access token ' +
				"for the target user and stashes the SYSOP's original token in a separate " +
				'HttpOnly cookie. Rejects self-impersonation and re-impersonation attempts.',
			summary: 'Start impersonating a user (SYSOP)',
		},
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.post('/impersonate/stop', handleStopImpersonate, {
		// requireRoleFresh('SYSOP') would evaluate the impersonated TARGET's role
		// and always 403. The handler rejects non-impersonating sessions and
		// re-validates the original impersonator's fresh SYSOP role itself.
		beforeHandle: requireAuth,
		detail: {
			description:
				'Stop impersonating and restore the original SYSOP session. Requires an active ' +
				'impersonation session (token with impersonatedBy claim); verifies the original ' +
				'impersonator is still SYSOP, revokes the impersonation access token, and ' +
				'restores the stashed original token.',
			summary: 'Stop impersonating (impersonation session only)',
		},
	});

export { usersImpersonateRoutes };

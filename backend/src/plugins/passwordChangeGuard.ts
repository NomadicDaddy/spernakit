import { Elysia } from 'elysia';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { getRequiresPasswordChange } from '../services/userService.ts';
import { AUTH_ERROR_CODES, forbiddenError } from '../utils/errorResponse.ts';
import { getCachedPasswordChange, setCachedPasswordChange } from '../utils/passwordChangeCache.ts';
import { authPlugin } from './auth.ts';

/**
 * Paths that are exempt from the password change enforcement guard.
 * These routes must remain accessible even when the user needs to change their password:
 * - /auth/me: allows the frontend to detect the requiresPasswordChange flag
 * - /users/me/password: allows the user to actually change their password
 * - /auth/logout: allows the user to log out
 * - /auth/refresh: allows token refresh to keep the session alive
 */
const EXEMPT_PATHS = new Set(['/auth/me', '/users/me/password', '/auth/logout', '/auth/refresh']);

/**
 * Check whether a user requires a password change, using a short-lived cache
 * to avoid a DB query on every authenticated request.
 *
 * @param userId - ID of the authenticated user
 * @returns True if the user must change their password
 */
function requiresPasswordChangeCheck(userId: number): boolean {
	const cached = getCachedPasswordChange(userId);
	if (cached !== undefined) {
		return cached;
	}

	const requiresChange = getRequiresPasswordChange(userId);
	setCachedPasswordChange(userId, requiresChange);
	return requiresChange;
}

/**
 * Elysia plugin that enforces password change for seed/demo accounts.
 *
 * When an authenticated user has `requiresPasswordChange = true`, all API requests
 * (except exempt paths) return 403 with AUTH_PASSWORD_CHANGE_REQUIRED error code.
 * This forces the frontend to redirect to the password change flow.
 */
const passwordChangeGuardPlugin = new Elysia({ name: 'password-change-guard' })
	.use(authPlugin)
	.onBeforeHandle({ as: 'scoped' }, ({ path, set, user }) => {
		if (!user) return undefined;

		// API key requests are not tied to password state
		if (user.isApiKey) return undefined;

		// Strip the /api/v1 prefix to get the route-local path
		const localPath = path.replace(/^\/api\/v1/, '');

		if (EXEMPT_PATHS.has(localPath)) return undefined;

		if (requiresPasswordChangeCheck(user.id)) {
			set.status = HTTP_STATUS.FORBIDDEN;
			return forbiddenError(
				'Password change required before accessing this resource',
				AUTH_ERROR_CODES.AUTH_PASSWORD_CHANGE_REQUIRED
			);
		}

		return undefined;
	});

export { passwordChangeGuardPlugin };

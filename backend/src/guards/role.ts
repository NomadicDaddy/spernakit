import type { AuthPayload } from '../plugins/auth.ts';
import type { UserRole } from '../types/roles.ts';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { getUserAuthStatus } from '../services/userService.ts';
import { ROLE_HIERARCHY } from '../types/roles.ts';
import { type ErrorResponse, forbiddenError, unauthorizedError } from '../utils/errorResponse.ts';

interface GuardContext {
	set: { status?: number | string };
	user: AuthPayload | null;
}

/**
 * Check if a user has SYSOP (system operator) role level.
 * SYSOP is the highest role and can bypass workspace isolation.
 *
 * @param user - The authenticated user payload (may be null)
 * @returns True if user is a SYSOP, false otherwise
 */
function isSysop(user: AuthPayload | null): boolean {
	if (!user) return false;
	return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY.SYSOP;
}

/**
 * Guard that checks if request has an authenticated user.
 * Returns 401 if unauthenticated.
 *
 * Supports both JWT authentication (via user) and API key authentication (via apiKey).
 *
 * Usage in Elysia beforeHandle:
 * ```ts
 * .get('/me', handler, { beforeHandle: requireAuth })
 * ```
 */
function requireAuth(ctx: GuardContext): ErrorResponse | undefined {
	if (!ctx.user) {
		ctx.set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError();
	}

	return undefined;
}

/**
 * Assert that the user payload is non-null.
 * Use in route handlers behind requireAuth / requireRoleFresh guards
 * to narrow `AuthPayload | null` to `AuthPayload` with runtime safety.
 *
 * @throws 401-shaped error if user is unexpectedly null
 */
function assertUser(user: AuthPayload | null): AuthPayload {
	if (!user) {
		throw new Error('Unauthenticated: expected user in guarded route');
	}
	return user;
}

/**
 * Check if a requester role level is strictly higher than a target role level.
 * Used for user CRUD operations where a user cannot modify others with equal or higher role.
 *
 * @param requesterRole - The role of the user attempting the action
 * @param targetRole - The role of the target user being acted upon
 * @returns True if requester can modify the target, false otherwise
 */
function canModifyRole(requesterRole: UserRole, targetRole: UserRole): boolean {
	const requesterLevel = ROLE_HIERARCHY[requesterRole] ?? 0;
	const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;
	return requesterLevel > targetLevel;
}

/**
 * Check if a user has at least the specified minimum role level.
 * Boolean version of requireRoleFresh guard for use in route handlers.
 *
 * @param userRole - The user's role to check
 * @param minimumRole - The minimum required role
 * @returns True if user meets or exceeds the minimum role, false otherwise
 */
function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
	return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Create a guard function that re-validates the user's role from the database
 * rather than trusting the JWT claim. Use for sensitive operations where stale
 * JWT claims could allow unauthorized access (e.g., user management, role changes).
 *
 * Returns 401 if unauthenticated or account deleted, 403 if insufficient role.
 *
 * @returns Async guard function that re-checks role from database
 */
function requireRoleFresh(minimumRole: UserRole): (ctx: GuardContext) => ErrorResponse | undefined {
	return (ctx: GuardContext) => {
		if (!ctx.user) {
			ctx.set.status = HTTP_STATUS.UNAUTHORIZED;
			return unauthorizedError();
		}

		const dbUser = getUserAuthStatus(ctx.user.id);

		if (!dbUser || dbUser.isDeleted) {
			ctx.set.status = HTTP_STATUS.UNAUTHORIZED;
			return unauthorizedError('Account has been deleted or not found');
		}

		// When authenticated via API key, cap the effective role at the key's scope
		// to prevent scope escalation (e.g., read-scoped key created by SYSOP).
		// authPlugin already maps keyScope → role (read→VIEWER, write→OPERATOR, admin→ADMIN).
		let effectiveRole = dbUser.role;
		if (ctx.user.isApiKey) {
			const scopeRole = ctx.user.role;
			if (ROLE_HIERARCHY[scopeRole] < ROLE_HIERARCHY[effectiveRole]) {
				effectiveRole = scopeRole;
			}
		}

		if (ROLE_HIERARCHY[effectiveRole] < ROLE_HIERARCHY[minimumRole]) {
			ctx.set.status = HTTP_STATUS.FORBIDDEN;
			return forbiddenError();
		}

		// Shallow-copy the user payload so the original JWT claims are never mutated.
		// Downstream handlers see the effective (fresh) role without risking stale re-signing.
		ctx.user = { ...ctx.user, role: effectiveRole };

		return undefined;
	};
}

export { assertUser, canModifyRole, hasMinimumRole, isSysop, requireAuth, requireRoleFresh };

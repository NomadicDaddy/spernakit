/**
 * User role types and hierarchy for role-based access control.
 *
 * SYSOP (5) > ADMIN (4) > MANAGER (3) > OPERATOR (2) > VIEWER (1)
 *
 * Higher roles inherit all lower role permissions.
 * Role hierarchy enforced via numeric comparison: user.roleLevel >= required.roleLevel
 */

type UserRole = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'SYSOP' | 'VIEWER';

/**
 * Global role hierarchy using a 1-5 numeric scale.
 * Higher values grant more privileges. Authorization checks use numeric comparison.
 *
 * Scale:
 * - VIEWER (1): Read-only access to permitted resources
 * - OPERATOR (2): Standard operations, data entry and modification
 * - MANAGER (3): Team and workspace member management
 * - ADMIN (4): Application administration, user management
 * - SYSOP (5): System administration, cross-workspace access, bypasses workspace isolation
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
	ADMIN: 4,
	MANAGER: 3,
	OPERATOR: 2,
	SYSOP: 5,
	VIEWER: 1,
};

/** All valid roles ordered by descending privilege level. */
const ROLES = ['SYSOP', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const;

const VALID_USER_ROLES = new Set<string>(Object.keys(ROLE_HIERARCHY));

/**
 * Type guard to check if a string is a valid UserRole.
 *
 * @param role - The string to check
 * @returns true if the string is a valid UserRole
 */
function isValidUserRole(role: string): role is UserRole {
	return VALID_USER_ROLES.has(role);
}

/**
 * Validate that a string is a valid UserRole.
 *
 * @param role - The string to validate
 * @returns The validated UserRole
 * @throws Error if the role is not valid
 */
function validateUserRole(role: string): UserRole {
	if (!VALID_USER_ROLES.has(role)) {
		throw new Error(`Invalid user role: ${role}`);
	}
	return role as UserRole;
}

/**
 * Check if a role meets or exceeds the minimum required role level.
 *
 * @param userRole - The user's current role
 * @param requiredRole - The minimum role required
 * @returns true if user has sufficient privileges
 */
function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
	return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export { hasMinimumRole, isValidUserRole, ROLE_HIERARCHY, ROLES, validateUserRole };
export type { UserRole };

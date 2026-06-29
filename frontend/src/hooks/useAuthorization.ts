import { useAuthStore } from '@/stores/authStore';
import { hasMinimumRole, isValidUserRole, type UserRole } from '@/types/roles';

/**
 * Hook providing authorization checks for role-based access control.
 * Use this to conditionally render UI elements based on user role.
 */
function useAuthorization() {
	const user = useAuthStore((s) => s.user);
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

	/**
	 * Check if the current user has a specific role.
	 *
	 * @param role - The exact role to check for
	 * @returns true if user has exactly this role
	 */
	function hasRole(role: UserRole): boolean {
		if (!user) return false;
		return user.role === role;
	}

	/**
	 * Check if the current user has at least the minimum required role.
	 * Uses role hierarchy: SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER
	 *
	 * @param minimumRole - The minimum role required
	 * @returns true if user has this role or higher
	 */
	function hasMinRole(minimumRole: UserRole): boolean {
		if (!user) return false;
		if (!isValidUserRole(user.role)) return false;
		return hasMinimumRole(user.role, minimumRole);
	}

	/**
	 * Check if the current user can perform actions requiring the specified role.
	 * Alias for hasMinRole for semantic clarity.
	 *
	 * @param requiredRole - The role required for the action
	 * @returns true if user is authorized
	 */
	function can(requiredRole: UserRole): boolean {
		return hasMinRole(requiredRole);
	}

	/**
	 * Check if the current user is a system operator (highest privilege).
	 */
	function isSysop(): boolean {
		return hasRole('SYSOP');
	}

	/**
	 * Check if the current user is at least an admin.
	 */
	function isAdmin(): boolean {
		return hasMinRole('ADMIN');
	}

	/**
	 * Check if the current user is at least a manager.
	 */
	function isManager(): boolean {
		return hasMinRole('MANAGER');
	}

	/**
	 * Check if the current user is at least an operator (write access to standard resources).
	 */
	function isOperator(): boolean {
		return hasMinRole('OPERATOR');
	}

	/**
	 * Get the display label for a role. Returns the configured label from
	 * the app's roles config, falling back to the raw role key.
	 */
	function roleLabel(role: UserRole): string {
		return user?.roleLabels?.[role]?.label ?? role;
	}

	return {
		can,
		hasMinRole,
		hasRole,
		isAdmin,
		isAuthenticated,
		isManager,
		isOperator,
		isSysop,
		roleLabel,
		user,
	} as const;
}

export { useAuthorization };

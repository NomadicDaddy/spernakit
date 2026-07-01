import { and, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { ROLE_HIERARCHY, type UserRole } from '../../types/roles.ts';

/**
 * Generic helper to check if a value exists in a specific column.
 *
 * @param column - The database column to check
 * @param value - The value to look for
 * @param excludeUserId - Optional user ID to exclude (for updates)
 * @returns True if value exists
 */
function valueExists(
	column: typeof users.email | typeof users.username,
	value: string,
	excludeUserId?: number
): boolean {
	const db = getDb();
	const condition = and(eq(column, value), eq(users.isDeleted, false));
	const query = db.select({ id: users.id }).from(users).where(condition);

	if (excludeUserId) {
		const existing = query.get();
		return existing ? existing.id !== excludeUserId : false;
	}

	return !!query.get();
}

/**
 * Check if a username already exists in the database.
 *
 * @param username - Username to check
 * @param excludeUserId - Optional user ID to exclude (for updates)
 * @returns True if username exists
 */
function usernameExists(username: string, excludeUserId?: number): boolean {
	return valueExists(users.username, username, excludeUserId);
}

/**
 * Check if an email already exists in the database.
 *
 * @param email - Email to check
 * @param excludeUserId - Optional user ID to exclude (for updates)
 * @returns True if email exists
 */
function emailExists(email: string, excludeUserId?: number): boolean {
	return valueExists(users.email, email, excludeUserId);
}

/**
 * Check if the requester can act on the target user based on role hierarchy.
 * Cannot act on users with equal or higher role level.
 *
 * @param requesterRoleLevel - Numeric role level of the requester
 * @param targetRole - Role of the target user
 * @returns True if requester can act on target
 */
function canActOnUser(requesterRoleLevel: number, targetRole: UserRole): boolean {
	const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;
	return targetLevel < requesterRoleLevel;
}

/**
 * Check if the current user can modify the target user based on role hierarchy.
 *
 * @param requesterRoleLevel - Numeric role level of the requester
 * @param targetRole - Role of the target user
 * @returns True if requester can modify target
 */
function canModifyUserRole(requesterRoleLevel: number, targetRole: UserRole): boolean {
	return canActOnUser(requesterRoleLevel, targetRole);
}

/**
 * Check if the requester can delete the target user.
 * Cannot delete users with equal or higher role level.
 *
 * @param requesterRoleLevel - Numeric role level of the requester
 * @param targetRole - Role of the target user
 * @returns True if requester can delete target
 */
function canDeleteUser(requesterRoleLevel: number, targetRole: UserRole): boolean {
	return canActOnUser(requesterRoleLevel, targetRole);
}

export { canDeleteUser, canModifyUserRole, emailExists, usernameExists };

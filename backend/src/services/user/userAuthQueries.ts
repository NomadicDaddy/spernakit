/**
 * Auth-related user queries.
 *
 * Provides lightweight user lookups needed by the auth plugin,
 * token refresh, and security health endpoints.
 *
 * @module userAuthQueries
 */

import { count, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { type UserRole } from '../../types/roles.ts';

interface UserAuthStatus {
	email: string;
	isDeleted: boolean;
	requiresPasswordChange: boolean;
	role: UserRole;
	username: string;
}

interface UserRefreshInfo {
	isDeleted: boolean;
	lockedUntil: Date | null;
	passwordChangedAt: Date | null;
	refreshTokenHash: null | string;
	role: UserRole;
	username: string;
}

/** Security-relevant user fields for health endpoint. */
interface UserSecurityInfo {
	email: string;
	failedLoginAttempts: number;
	id: number;
	lockedUntil: Date | null;
	passwordChangedAt: Date | null;
	username: string;
}

/**
 * Get a user's email and deletion status for auth verification.
 * Unlike getUserById, this does NOT filter out deleted users so the caller
 * can distinguish "not found" from "deleted".
 *
 * Always performs a fresh DB lookup to ensure requireRoleFresh guard
 * sees current role/deletion state without cache staleness.
 *
 * @param id - User ID
 * @returns Email and isDeleted flag, or null if not found
 */
function getUserAuthStatus(id: number): null | UserAuthStatus {
	const db = getDb();
	return (
		db
			.select({
				email: users.email,
				isDeleted: users.isDeleted,
				requiresPasswordChange: users.requiresPasswordChange,
				role: users.role,
				username: users.username,
			})
			.from(users)
			.where(eq(users.id, id))
			.get() ?? null
	);
}

/**
 * Get a user's deletion status and refresh token hash for token refresh validation.
 *
 * @param id - User ID
 * @returns isDeleted and refreshTokenHash, or null if not found
 */
function getUserRefreshInfo(id: number): null | UserRefreshInfo {
	const db = getDb();
	return (
		db
			.select({
				isDeleted: users.isDeleted,
				lockedUntil: users.lockedUntil,
				passwordChangedAt: users.passwordChangedAt,
				refreshTokenHash: users.refreshTokenHash,
				role: users.role,
				username: users.username,
			})
			.from(users)
			.where(eq(users.id, id))
			.get() ?? null
	);
}

/** Maximum number of users returned by the security info endpoint. */
const MAX_SECURITY_INFO_ROWS = 1000;

/**
 * Get security-relevant fields for all active users.
 * Used by the security health endpoint.
 *
 * @returns Array of users with security fields
 */
function getAllUsersSecurityInfo(): UserSecurityInfo[] {
	const db = getDb();
	return db
		.select({
			email: users.email,
			failedLoginAttempts: users.failedLoginAttempts,
			id: users.id,
			lockedUntil: users.lockedUntil,
			passwordChangedAt: users.passwordChangedAt,
			username: users.username,
		})
		.from(users)
		.where(eq(users.isDeleted, false))
		.limit(MAX_SECURITY_INFO_ROWS)
		.all() as UserSecurityInfo[];
}

/**
 * Get total count of active (non-deleted) users.
 *
 * @returns Total active user count
 */
function getTotalUserCount(): number {
	const db = getDb();
	const result = db
		.select({ count: count() })
		.from(users)
		.where(eq(users.isDeleted, false))
		.get();
	return result?.count ?? 0;
}

/** Lightweight account status for login gates (OAuth callback, WS re-validation). */
interface UserAccountStatus {
	isDeleted: boolean;
	lockedUntil: Date | null;
	passwordChangedAt: Date | null;
	requiresPasswordChange: boolean;
}

/**
 * Get a user's account status for login-gate checks.
 * Used by OAuth callback and WebSocket re-validation to avoid direct Drizzle calls in routes.
 *
 * @param id - User ID
 * @returns Account status fields, or null if user not found
 */
function getUserAccountStatus(id: number): null | UserAccountStatus {
	const db = getDb();
	return (
		db
			.select({
				isDeleted: users.isDeleted,
				lockedUntil: users.lockedUntil,
				passwordChangedAt: users.passwordChangedAt,
				requiresPasswordChange: users.requiresPasswordChange,
			})
			.from(users)
			.where(eq(users.id, id))
			.get() ?? null
	);
}

/**
 * Get a user's CSRF signing secret.
 *
 * @param userId - User ID
 * @returns The stored CSRF secret, or null if not set or user not found
 */
function getCsrfSecret(userId: number): null | string {
	const db = getDb();
	const row = db
		.select({ csrfToken: users.csrfToken })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	return row?.csrfToken ?? null;
}

/**
 * Store a CSRF signing secret for a user.
 *
 * @param userId - User ID
 * @param secret - The CSRF secret to store
 */
function setCsrfSecret(userId: number, secret: string): void {
	const db = getDb();
	db.update(users).set({ csrfToken: secret }).where(eq(users.id, userId)).run();
}

/**
 * Check whether a user requires a password change.
 * Lightweight single-column query for the password change guard.
 *
 * @param userId - User ID
 * @returns True if user must change their password, false if not or user not found
 */
function getRequiresPasswordChange(userId: number): boolean {
	const db = getDb();
	const row = db
		.select({ requiresPasswordChange: users.requiresPasswordChange })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	return row?.requiresPasswordChange ?? false;
}

export {
	getAllUsersSecurityInfo,
	getCsrfSecret,
	getRequiresPasswordChange,
	getTotalUserCount,
	getUserAccountStatus,
	getUserAuthStatus,
	getUserRefreshInfo,
	setCsrfSecret,
};
export type { UserAccountStatus };

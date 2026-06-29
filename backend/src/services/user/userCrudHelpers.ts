import { and, eq } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';

import { getDb } from '../../db/index.ts';
import { users } from '../../db/schema/users.ts';
import { type UserRole } from '../../types/roles.ts';
import { UniqueConstraintError } from '../../utils/errorResponse.ts';
import { emailExists, usernameExists } from './userValidationService.ts';

type UserPublic = {
	createdAt: Date;
	email: string;
	failedLoginAttempts: number;
	id: number;
	lastLoginAt: Date | null;
	lockedUntil: Date | null;
	role: UserRole;
	updatedAt: Date | null;
	username: string;
};

interface UpdateInput {
	email?: string;
	role?: UserRole;
	updatedBy?: number;
	username?: string;
}

type ExistingUserForUpdate = {
	email: string;
	id: number;
	isDeleted: boolean;
	username: string;
};

/** LRU cache for user profile lookups by ID. TTL: 5 minutes, max 500 entries. */
const userCache = new LRUCache<number, UserPublic>({
	max: 500,
	ttl: 5 * 60 * 1000,
});

/**
 * Invalidate a cached user profile by ID. Used by sibling services (e.g.
 * userPasswordAdminService) that mutate the user row but do not own the cache.
 *
 * @param id - User ID whose cached profile should be evicted
 */
function invalidateUserProfileCache(id: number): void {
	userCache.delete(id);
}

/**
 * Get the shared user cache instance. Only for use by userCrud.ts — other
 * consumers should import from the facade (userService.ts).
 *
 * @returns The LRU cache instance for user profiles
 */
function getUserCache(): LRUCache<number, UserPublic> {
	return userCache;
}

/**
 * Enforce username and email uniqueness when either field changes.
 *
 * @param id - User ID being updated.
 * @param input - Requested user field changes.
 * @param existing - Current persisted username and email.
 * @param existing.email - Current persisted email.
 * @param existing.username - Current persisted username.
 */
function enforceUserUniqueness(
	id: number,
	input: UpdateInput,
	existing: { email: string; username: string }
): void {
	if (input.username !== undefined && input.username !== existing.username) {
		if (usernameExists(input.username, id))
			throw new UniqueConstraintError('Username already taken');
	}

	if (input.email !== undefined && input.email !== existing.email) {
		if (emailExists(input.email, id)) throw new UniqueConstraintError('Email already taken');
	}
}

/**
 * Build the partial user update payload and clear email verification on email changes.
 *
 * @param input - Requested user field changes.
 * @param existing - Current persisted user fields needed for side-effect decisions.
 * @param existing.email - Current persisted email.
 * @returns Drizzle update payload for the requested user changes.
 */
function buildUpdateUserPayload(
	input: UpdateInput,
	existing: { email: string }
): Record<string, boolean | Date | null | number | string | UserRole> {
	const updateData: Record<string, boolean | Date | null | number | string | UserRole> = {
		updatedAt: new Date(),
	};
	if (input.username !== undefined) updateData.username = input.username;
	if (input.email !== undefined) {
		updateData.email = input.email;
		if (input.email !== existing.email) {
			updateData.emailVerified = false;
			updateData.emailVerificationToken = null;
			updateData.emailVerificationExpiresAt = null;
		}
	}
	if (input.role !== undefined) updateData.role = input.role;
	if (input.updatedBy !== undefined) updateData.updatedBy = input.updatedBy;
	return updateData;
}

/**
 * Load the current user fields needed to validate and build an update.
 *
 * @param id - User ID to load.
 * @returns Existing user fields, or null when no row exists.
 */
function getExistingUserForUpdate(id: number): ExistingUserForUpdate | null {
	const db = getDb();
	return (
		db
			.select({
				email: users.email,
				id: users.id,
				isDeleted: users.isDeleted,
				username: users.username,
			})
			.from(users)
			.where(eq(users.id, id))
			.get() ?? null
	);
}

/**
 * Unlock a locked user account by resetting failed login attempts and clearing the lock.
 *
 * @param id - User ID to unlock
 * @returns True if the user was found and unlocked, false if not found
 */
function unlockUser(id: number): boolean {
	const db = getDb();
	const existing = db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, id), eq(users.isDeleted, false)))
		.get();

	if (!existing) return false;

	db.update(users)
		.set({
			failedLoginAttempts: 0,
			lockedUntil: null,
			updatedAt: new Date(),
		})
		.where(eq(users.id, id))
		.run();

	userCache.delete(id);
	return true;
}

/**
 * Hard-delete a user for rollback compensation during registration.
 * This is intentionally NOT a soft delete — the user was only partially
 * initialized and should not appear in audit or recovery paths.
 *
 * @param userId - User ID to permanently delete
 */
function hardDeleteUserForRollback(userId: number): void {
	const db = getDb();
	db.delete(users).where(eq(users.id, userId)).run();
	userCache.delete(userId);
}

export {
	buildUpdateUserPayload,
	enforceUserUniqueness,
	getExistingUserForUpdate,
	getUserCache,
	hardDeleteUserForRollback,
	invalidateUserProfileCache,
	unlockUser,
};
export type { ExistingUserForUpdate, UpdateInput, UserPublic };

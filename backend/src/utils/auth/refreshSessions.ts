import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import { parseDurationMs } from '../../constants/auth.ts';
import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { refreshSessions } from '../../db/schema/refreshSessions.ts';
import { hashRefreshToken } from './authHelpers.ts';

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/** The stored refresh-token row a presented token resolved to. */
export type RefreshSessionRow = typeof refreshSessions.$inferSelect;

/**
 * When a refresh token issued now stops being honoured.
 * @returns The expiry, matching the refresh JWT's own
 */
export function refreshExpiry(): Date {
	const ttlMs = parseDurationMs(getConfig().security.jwtRefreshExpiresIn, 7 * MS_PER_DAY);
	return new Date(Date.now() + ttlMs);
}

/**
 * A fresh family id for a new sign-in.
 * @returns A random id, so one family cannot be guessed from another
 */
export function newRefreshFamilyId(): string {
	return randomUUID();
}

/**
 * Record the first refresh token of a new sign-in. Each sign-in gets its own family, so a user
 * signed in on two browsers holds two families and neither displaces the other.
 * @param userId
 * @param familyId
 * @param refreshToken
 */
export function storeRefreshSession(userId: number, familyId: string, refreshToken: string): void {
	getDb()
		.insert(refreshSessions)
		.values({
			expiresAt: refreshExpiry(),
			familyId,
			tokenHash: hashRefreshToken(refreshToken),
			userId,
		})
		.run();
}

/**
 * Find the stored row for a presented refresh token, rotated or not.
 * @param refreshToken
 * @returns The row, or undefined when the server holds none for this token
 */
export function findRefreshSession(refreshToken: string): RefreshSessionRow | undefined {
	return getDb()
		.select()
		.from(refreshSessions)
		.where(eq(refreshSessions.tokenHash, hashRefreshToken(refreshToken)))
		.get();
}

/**
 * Rotate within a family: mark the presented row rotated and store its successor, atomically.
 * The rotation is conditional on the row still being unrotated, so of two concurrent refreshes
 * with the same token exactly one succeeds.
 *
 * @param row
 * @param newRefreshToken
 * @returns `true` when this call rotated the row, `false` when another request already had
 */
export function rotateRefreshSession(row: RefreshSessionRow, newRefreshToken: string): boolean {
	return getDb().transaction((tx) => {
		const claimed = tx
			.update(refreshSessions)
			.set({ rotatedAt: new Date() })
			.where(and(eq(refreshSessions.id, row.id), isNull(refreshSessions.rotatedAt)))
			.returning({ id: refreshSessions.id })
			.all();
		if (claimed.length === 0) return false;
		tx.insert(refreshSessions)
			.values({
				expiresAt: refreshExpiry(),
				familyId: row.familyId,
				tokenHash: hashRefreshToken(newRefreshToken),
				userId: row.userId,
			})
			.run();
		return true;
	});
}

/**
 * End one sign-in: every token in the family stops refreshing.
 * @param familyId
 */
export function endRefreshFamily(familyId: string): void {
	getDb().delete(refreshSessions).where(eq(refreshSessions.familyId, familyId)).run();
}

/**
 * End every sign-in a user has, for password changes, resets, deletion and admin actions.
 * Pass the caller's transaction when the sign-out must commit with the change that caused it.
 * @param userId
 * @param tx
 */
export function endAllRefreshSessions(userId: number, tx?: DbTransaction): void {
	(tx ?? getDb()).delete(refreshSessions).where(eq(refreshSessions.userId, userId)).run();
}

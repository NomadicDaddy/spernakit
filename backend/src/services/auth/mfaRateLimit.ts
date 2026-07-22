import { eq } from 'drizzle-orm';

import { getConfig } from '../../config/configLoader.ts';
import { getDb } from '../../db/index.ts';
import { rateLimitEntries } from '../../db/schema/rateLimitEntries.ts';
import { checkRouteLimit, createRateLimitStore } from '../../plugins/rateLimit/index.ts';

const MAX_MFA_ATTEMPTS = 10;
const MFA_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const mfaStore = createRateLimitStore();

function getMfaRateLimitKey(userId: number): string {
	return `mfa:user:${userId}`;
}

/**
 * Check and increment the MFA attempt counter for a user.
 *
 * @param userId - ID of the user attempting MFA verification
 * @returns True if the user has exceeded the attempt limit and is blocked
 */
function isMfaRateLimited(userId: number): boolean {
	mfaStore.startCleanup();
	return checkRouteLimit(mfaStore, getMfaRateLimitKey(userId), MAX_MFA_ATTEMPTS, MFA_WINDOW_MS)
		.limited;
}

/**
 * Reset the MFA attempt counter for a user after successful verification.
 *
 * @param userId - ID of the user whose attempt counter should be cleared
 */
function resetMfaAttempts(userId: number): void {
	const key = getMfaRateLimitKey(userId);
	if (getConfig().rateLimit.backend === 'database') {
		getDb().delete(rateLimitEntries).where(eq(rateLimitEntries.key, key)).run();
		return;
	}
	mfaStore.reset(key);
}

export { isMfaRateLimited, resetMfaAttempts };

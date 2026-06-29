import { logScheduler } from '../../utils/logger.ts';
import { cleanupExpiredRateLimitEntries } from '../rateLimitService.ts';

/**
 * Scheduled task that cleans up expired rate limit entries from the database.
 * Runs on a 1-minute interval via the scheduler (replacing the previous
 * in-memory setInterval callback in the rate limit plugin).
 *
 * @returns Object with count of cleaned entries
 */
function rateLimitCleanupTask(): { cleaned: number } {
	const cleaned = cleanupExpiredRateLimitEntries();
	if (cleaned > 0) {
		logScheduler('info', 'Rate limit cleanup task completed', { cleaned });
	}
	return { cleaned };
}

export { rateLimitCleanupTask };

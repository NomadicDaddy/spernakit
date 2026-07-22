import { authStore } from './authRateLimitPlugin.ts';
import { apiStore } from './rateLimitPlugin.ts';

export { authRateLimitPlugin } from './authRateLimitPlugin.ts';
export { checkRouteLimit, isRateLimitBypassed } from './helpers.ts';
export { rateLimitPlugin } from './rateLimitPlugin.ts';
export { createRateLimitStore } from './store.ts';

/**
 * Stop all rate limit cleanup intervals and clear stores.
 * Used during graceful shutdown.
 */
function stopRateLimitCleanup(): void {
	apiStore.stopCleanup();
	authStore.stopCleanup();
}

export { stopRateLimitCleanup };

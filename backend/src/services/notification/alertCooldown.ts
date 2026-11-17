import { and, eq, gte, isNull, ne } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { healthCheckAlerts } from '../../db/schema/healthChecks.ts';

/**
 * Whether another unresolved alert of this check type was successfully notified within the
 * cooldown window.
 *
 * The window is measured from notifiedAt, the last successful delivery, never from createdAt.
 * A new alert row is created every 15 minutes while a check stays degraded, and a row the
 * cooldown suppressed is never notified. Measuring from creation let each suppressed row extend
 * the window, so any cooldown above 15 minutes muted every follow-up warning after the first.
 * A resolved alert does not count, so a condition that is resolved and then recurs notifies.
 *
 * @param checkType - The health check type the candidate alert belongs to
 * @param cooldownMinutes - alerting.cooldownMinutes
 * @param excludeAlertId - The candidate alert itself, so its own retries are not suppressed
 * @returns True when the candidate should be skipped
 */
function hasRecentAlert(
	checkType: string,
	cooldownMinutes: number,
	excludeAlertId?: number,
): boolean {
	const cooldownTime = new Date(Date.now() - cooldownMinutes * 60 * 1000);

	const conditions = [
		eq(healthCheckAlerts.checkType, checkType),
		isNull(healthCheckAlerts.resolvedAt),
		gte(healthCheckAlerts.notifiedAt, cooldownTime),
	];
	if (excludeAlertId !== undefined) {
		conditions.push(ne(healthCheckAlerts.id, excludeAlertId));
	}

	const recent = getDb()
		.select({ id: healthCheckAlerts.id })
		.from(healthCheckAlerts)
		.where(and(...conditions))
		.limit(1)
		.get();

	return recent !== undefined;
}

/**
 * Record that at least one channel delivered this alert, which starts its cooldown window.
 *
 * @param alertId - The delivered alert
 */
function markAlertNotified(alertId: number): void {
	getDb()
		.update(healthCheckAlerts)
		.set({ notifiedAt: new Date() })
		.where(eq(healthCheckAlerts.id, alertId))
		.run();
}

export { hasRecentAlert, markAlertNotified };

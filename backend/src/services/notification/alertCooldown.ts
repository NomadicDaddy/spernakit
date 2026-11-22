import { eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { healthCheckAlerts } from '../../db/schema/healthChecks.ts';

/**
 * Whether an open alert is due a reminder: it has never been delivered, or its last successful
 * delivery is at least cooldownMinutes old. A check keeps one open row per condition, so the
 * cooldown is measured on that row alone, at either severity.
 *
 * @param notifiedAt - The open alert's last successful delivery, or null if none
 * @param cooldownMinutes - alerting.cooldownMinutes
 * @param now - The current time
 * @returns True when the alert should be sent again
 */
function isReminderDue(
	notifiedAt: Date | null,
	cooldownMinutes: number,
	now: Date = new Date(),
): boolean {
	if (!notifiedAt) return true;
	return now.getTime() - notifiedAt.getTime() >= cooldownMinutes * 60 * 1000;
}

/**
 * Record that at least one channel delivered this alert, which starts its cooldown.
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

export { isReminderDue, markAlertNotified };

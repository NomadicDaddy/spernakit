import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { healthCheckAlerts } from '../../db/schema/healthChecks.ts';

function hasRecentAlert(
	checkType: string,
	cooldownMinutes: number,
	excludeAlertId?: number
): boolean {
	const db = getDb();
	const cooldownTime = new Date(Date.now() - cooldownMinutes * 60 * 1000);

	const conditions = [
		eq(healthCheckAlerts.checkType, checkType),
		isNull(healthCheckAlerts.resolvedAt),
	];
	if (excludeAlertId !== undefined) {
		conditions.push(ne(healthCheckAlerts.id, excludeAlertId));
	}

	const mostRecentAlert = db
		.select({ createdAt: healthCheckAlerts.createdAt })
		.from(healthCheckAlerts)
		.where(and(...conditions))
		.orderBy(desc(healthCheckAlerts.createdAt))
		.limit(1)
		.get();

	return mostRecentAlert !== undefined && mostRecentAlert.createdAt >= cooldownTime;
}

export { hasRecentAlert };

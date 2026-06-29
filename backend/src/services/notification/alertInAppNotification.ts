import type { UserRole } from '../../types/roles.ts';
import type { AlertData, AlertNotificationResult } from './alertWebhook.ts';

import { getConfig } from '../../config/configLoader.ts';
import { logger } from '../../utils/logger.ts';
import { severityLabel } from './alertFormatting.ts';
import { broadcast as broadcastNotification } from './notificationBroadcastService.ts';

function sendInAppAlert(alert: AlertData): AlertNotificationResult {
	const config = getConfig();
	const { alerting, app } = config;

	if (!alerting.inApp.enabled) {
		return { channel: 'in-app', error: 'In-app alerting disabled', success: false };
	}

	const label = severityLabel(alert.severity);
	const title = `[${label}] ${alert.checkType} Check Failed`;
	const message = `${app.name} health check alert: ${alert.message}. View System Health for details.`;

	const count = broadcastNotification({
		message,
		roleFilter: 'ADMIN' satisfies UserRole,
		title,
		type: alert.severity === 'critical' ? 'error' : 'warning',
	});

	if (count === 0) {
		logger.warn({ alertId: alert.id }, 'No admin users found for in-app alert notification');
		return { channel: 'in-app', error: 'No admin users found', success: false };
	}

	logger.info(
		{ alertId: alert.id, channel: 'in-app', recipientCount: count },
		'In-app alert sent'
	);
	return { channel: 'in-app', success: true };
}

export { sendInAppAlert };

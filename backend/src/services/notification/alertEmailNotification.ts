import type { AlertData, AlertNotificationResult } from './alertWebhook.ts';

import { getConfig } from '../../config/configLoader.ts';
import { mapWithConcurrency } from '../../utils/async.ts';
import { logger } from '../../utils/logger.ts';
import { sendEmail } from '../emailService.ts';
import {
	buildHealthCheckAlertVariables,
	loadEmailTemplate,
	renderTemplate,
} from '../templateService.ts';
import { severityLabel } from './alertFormatting.ts';

function buildAlertEmailContent(
	alert: AlertData,
	appName: string,
	frontendUrl: string
): { subject: string; text: string } {
	const label = severityLabel(alert.severity);
	const healthUrl = `${frontendUrl}/settings#system-health`;

	return {
		subject: `[${label}] ${alert.checkType} Check Failed - ${appName}`,
		text: `Health Check Alert\n\n Severity: ${label}\n Check Type: ${alert.checkType}\n Message: ${alert.message}\n Timestamp: ${alert.createdAt.toISOString()}\n\n View details: ${healthUrl}\n\n This is an automated alert from ${appName}.`,
	};
}

async function sendEmailAlert(alert: AlertData): Promise<AlertNotificationResult> {
	const config = getConfig();
	const { alerting, app, server } = config;

	if (!alerting.email.enabled || alerting.email.recipients.length === 0) {
		return { channel: 'email', error: 'Email alerting not configured', success: false };
	}

	const { subject, text } = buildAlertEmailContent(alert, app.name, server.frontendUrl);

	const templateVariables = buildHealthCheckAlertVariables({
		appName: app.name,
		checkType: alert.checkType,
		createdAt: alert.createdAt,
		frontendUrl: server.frontendUrl,
		message: alert.message,
		severity: alert.severity,
	});
	const htmlTemplate = await loadEmailTemplate('health-check-alert');
	const html = renderTemplate(htmlTemplate, templateVariables);

	const settled = await mapWithConcurrency(
		alerting.email.recipients,
		(recipient) => sendEmail({ html, subject, text, to: recipient }),
		5
	);

	for (const outcome of settled) {
		const sent = outcome.status === 'fulfilled' && outcome.value.success;
		if (sent) {
			logger.info({ alertId: alert.id, channel: 'email' }, 'Alert email sent');
		} else {
			logger.error({ alertId: alert.id, channel: 'email' }, 'Failed to send alert email');
		}
	}

	const anySuccess = settled.some((s) => s.status === 'fulfilled' && s.value.success);
	return anySuccess
		? { channel: 'email', success: true }
		: { channel: 'email', error: 'Failed to send to all recipients', success: false };
}

export { sendEmailAlert };

/**
 * Webhook delivery for health check alerts.
 *
 * Handles payload construction, HMAC signing, URL validation,
 * and HTTP request dispatching with timeout support.
 *
 * @module alertWebhook
 */

import { createHmac } from 'node:crypto';

import { getConfig } from '../../config/configLoader.ts';
import { logger } from '../../utils/logger.ts';
import { validateWebhookUrl } from '../../utils/urlValidator.ts';

interface AlertData {
	checkType: string;
	createdAt: Date;
	id: number;
	message: string;
	severity: 'critical' | 'warn';
}

interface AlertNotificationResult {
	channel: 'email' | 'in-app' | 'webhook';
	error?: string;
	success: boolean;
}

interface WebhookPayload {
	alertId: number;
	application: string;
	checkType: string;
	environment: string;
	message: string;
	severity: 'critical' | 'warn';
	timestamp: string;
	url: string;
}

function buildWebhookPayload(
	alert: AlertData,
	appName: string,
	nodeEnv: string,
	frontendUrl: string
): WebhookPayload {
	return {
		alertId: alert.id,
		application: appName,
		checkType: alert.checkType,
		environment: nodeEnv,
		message: alert.message,
		severity: alert.severity,
		timestamp: alert.createdAt.toISOString(),
		url: `${frontendUrl}/settings#system-health`,
	};
}

async function sendWebhookRequest(
	url: string,
	payload: object,
	headers: Record<string, string>,
	timeoutMs: number
): Promise<{ error?: string; ok: boolean; status?: number }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			body: JSON.stringify(payload),
			headers,
			method: 'POST',
			redirect: 'manual',
			signal: controller.signal,
		});
		clearTimeout(timeout);
		if (response.ok) return { ok: true, status: response.status };
		return {
			error: `HTTP ${response.status}`,
			ok: false,
			status: response.status,
		};
	} catch (err) {
		clearTimeout(timeout);
		return { error: err instanceof Error ? err.message : 'Unknown error', ok: false };
	}
}

async function sendWebhookAlert(alert: AlertData): Promise<AlertNotificationResult> {
	const config = getConfig();
	const { alerting, app, server } = config;

	if (!alerting.webhook.enabled || !alerting.webhook.url) {
		return { channel: 'webhook', error: 'Webhook alerting not configured', success: false };
	}

	// Validate webhook URL against SSRF and get resolved URL to prevent DNS rebinding
	const validation = await validateWebhookUrl(alerting.webhook.url);
	if (validation.error) {
		logger.error(
			{ alertId: alert.id, error: validation.error, url: alerting.webhook.url },
			'Alert webhook URL validation failed'
		);
		return {
			channel: 'webhook',
			error: `URL validation failed: ${validation.error}`,
			success: false,
		};
	}

	const payload = buildWebhookPayload(alert, app.name, server.nodeEnv, server.frontendUrl);
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...alerting.webhook.headers,
	};

	// Use resolved URL (hostname replaced with IP) to prevent DNS rebinding TOCTOU.
	// Set Host header to original hostname for correct virtual host routing.
	if (validation.originalHost) {
		headers['Host'] = validation.originalHost;
	}

	if (alerting.webhook.secret) {
		const signature = createHmac('sha256', alerting.webhook.secret)
			.update(JSON.stringify(payload))
			.digest('hex');
		headers['X-Signature'] = signature;
	}

	const result = await sendWebhookRequest(
		validation.resolvedUrl ?? alerting.webhook.url,
		payload,
		headers,
		alerting.webhook.timeoutMs
	);

	if (result.ok) {
		logger.info(
			{ alertId: alert.id, channel: 'webhook', statusCode: result.status },
			'Alert webhook sent'
		);
		return { channel: 'webhook', success: true };
	}

	logger.error(
		{ alertId: alert.id, channel: 'webhook', error: result.error, statusCode: result.status },
		'Webhook failed'
	);
	return { channel: 'webhook', error: result.error ?? 'Unknown error', success: false };
}

export { sendWebhookAlert };
export type { AlertData, AlertNotificationResult };

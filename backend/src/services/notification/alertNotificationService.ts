import type { AlertData, AlertNotificationResult } from './alertWebhook.ts';

import { getConfig } from '../../config/configLoader.ts';
import { sleep } from '../../utils/async.ts';
import { logger } from '../../utils/logger.ts';
import { hasRecentAlert } from './alertCooldown.ts';
import { sendEmailAlert } from './alertEmailNotification.ts';
import { sendInAppAlert } from './alertInAppNotification.ts';
import {
	type AlertChannel,
	logFinalFailure,
	logRetryScheduled,
	logRetrySuccess,
	recordAttemptResults,
} from './alertRetry.ts';
import { sendWebhookAlert } from './alertWebhook.ts';

/**
 * Send alert notifications through all configured channels.
 *
 * @param alert - The health check alert data
 * @param skipChannels - Channels to skip (already succeeded on a previous attempt)
 * @returns Array of results for each notification channel
 */
async function sendAlertNotifications(
	alert: AlertData,
	skipChannels?: Set<AlertChannel>
): Promise<AlertNotificationResult[]> {
	const config = getConfig();
	const { alerting } = config;

	// Check cooldown - for warnings only (critical alerts bypass cooldown)
	if (alert.severity !== 'critical') {
		if (hasRecentAlert(alert.checkType, alerting.cooldownMinutes, alert.id)) {
			logger.info(
				{
					alertId: alert.id,
					checkType: alert.checkType,
					cooldownMinutes: alerting.cooldownMinutes,
				},
				'Alert notification skipped due to cooldown'
			);
			return [];
		}
	}

	// Dispatch enabled channels in parallel — failures in one channel don't affect others
	const channelPromises: Promise<AlertNotificationResult>[] = [];
	const channels: AlertChannel[] = [];
	if (alerting.email.enabled && !skipChannels?.has('email')) {
		channelPromises.push(sendEmailAlert(alert));
		channels.push('email');
	}
	if (alerting.webhook.enabled && !skipChannels?.has('webhook')) {
		channelPromises.push(sendWebhookAlert(alert));
		channels.push('webhook');
	}
	if (alerting.inApp.enabled && !skipChannels?.has('in-app')) {
		channelPromises.push(Promise.resolve(sendInAppAlert(alert)));
		channels.push('in-app');
	}

	const settled = await Promise.allSettled(channelPromises);
	const results: AlertNotificationResult[] = settled.map((s, i) =>
		s.status === 'fulfilled'
			? s.value
			: { channel: channels[i] as AlertChannel, error: String(s.reason), success: false }
	);

	return results;
}

const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Send alert notifications with retry across channels.
 * Never throws: call sites fire-and-forget (`void sendAlertWithRetry(...)`), so an
 * escaped rejection would hit the fatal unhandledRejection handler in app.ts.
 * @param alert - Alert payload to deliver across configured channels.
 * @param maxRetries - Maximum delivery attempts per channel.
 * @returns Per-channel delivery results (partial results on unexpected failure).
 */
async function sendAlertWithRetry(
	alert: AlertData,
	maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<AlertNotificationResult[]> {
	const allResults = new Map<AlertChannel, AlertNotificationResult>();
	const succeededChannels = new Set<AlertChannel>();

	try {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const results = await sendAlertNotifications(alert, succeededChannels);
			const failed = recordAttemptResults(results, allResults, succeededChannels);
			if (failed.length === 0) {
				logRetrySuccess(alert.id, attempt, maxRetries);
				return [...allResults.values()];
			}

			const failedChannelNames = failed.map((r) => r.channel);

			if (attempt < maxRetries) {
				const delayMs = BASE_DELAY_MS * attempt;
				logRetryScheduled(alert.id, attempt, maxRetries, failedChannelNames, delayMs);
				await sleep(delayMs);
			} else {
				logFinalFailure(alert.id, maxRetries, failedChannelNames);
			}
		}
	} catch (err) {
		logger.error({ alertId: alert.id, err }, 'Unexpected error during alert send with retry');
	}

	return [...allResults.values()];
}

export { sendAlertNotifications, sendAlertWithRetry };

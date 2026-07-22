import type { AlertNotificationResult } from './alertWebhook.ts';

import { logger } from '../../utils/logger.ts';

type AlertChannel = 'email' | 'in-app' | 'webhook';

function recordAttemptResults(
	results: AlertNotificationResult[],
	allResults: Map<AlertChannel, AlertNotificationResult>,
	succeededChannels: Set<AlertChannel>
): AlertNotificationResult[] {
	for (const result of results) {
		allResults.set(result.channel, result);
		if (result.success) {
			succeededChannels.add(result.channel);
		}
	}

	return results.filter((r) => !r.success);
}

function logRetrySuccess(alertId: number, attempt: number, maxRetries: number): void {
	if (attempt <= 1) {
		return;
	}

	logger.info({ alertId, attempt, maxRetries }, 'Alert notifications succeeded after retry');
}

function logRetryScheduled(
	alertId: number,
	attempt: number,
	maxRetries: number,
	failedChannels: AlertChannel[],
	delayMs: number
): void {
	logger.warn(
		{
			alertId,
			attempt,
			failedChannels,
			maxRetries,
			nextRetryIn: delayMs,
		},
		'Alert notification failed, will retry'
	);
}

function logFinalFailure(
	alertId: number,
	maxRetries: number,
	failedChannels: AlertChannel[]
): void {
	logger.error(
		{
			alertId,
			failedChannels,
			maxRetries,
		},
		'Alert notifications failed after all retries'
	);
}

export {
	type AlertChannel,
	logFinalFailure,
	logRetryScheduled,
	logRetrySuccess,
	recordAttemptResults,
};

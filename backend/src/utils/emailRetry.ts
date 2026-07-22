import type { SendEmailResult } from '../services/emailService.ts';

import { getConfig } from '../config/configLoader.ts';
import { SERVICE_ERRORS } from '../constants/serviceResults.ts';
import { logger } from './logger.ts';

/**
 * Send an email with retry logic, parameterized by a sender function.
 * Only retries on 'send_failed' — 'not_configured' fails immediately without retry.
 * Never throws: call sites fire-and-forget (`void sendEmailWithRetry(...)`), so an
 * escaped rejection would hit the fatal unhandledRejection handler in app.ts.
 * @param label
 * @param send
 */
async function sendEmailWithRetry(
	label: string,
	send: () => Promise<SendEmailResult>
): Promise<void> {
	try {
		const config = getConfig();
		const maxRetries = config.email.retryAttempts;
		const retryDelay = config.email.retryDelayMs;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const result = await send();
			if (result.success) {
				return;
			}
			if (result.reason === SERVICE_ERRORS.SMTP_NOT_CONFIGURED) {
				logger.warn({ label }, 'SMTP not configured - email not sent');
				return;
			}
			logger.error({ attempt, err: result.error, label, maxRetries }, 'Email send failed');
			if (attempt < maxRetries) {
				await Bun.sleep(retryDelay * attempt);
			}
		}
		logger.error({ label }, 'All email attempts exhausted');
	} catch (err) {
		logger.error({ err, label }, 'Unexpected error during email send with retry');
	}
}

export { sendEmailWithRetry };

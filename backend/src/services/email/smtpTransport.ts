import type { Transporter } from 'nodemailer';

import nodemailer from 'nodemailer';

import type { SendEmailInput, SendEmailResult } from './emailTypes.ts';

import { logger } from '../../utils/logger.ts';
import { getSmtpConfig } from '../smtpService.ts';

let cachedTransporter: null | Transporter = null;
let cachedConfigKey = '';

/**
 * Send an email using configured SMTP settings.
 * Returns a typed result indicating whether the email was sent, SMTP was not configured, or sending failed.
 *
 * @param input - Email recipient, subject, and body (html/text)
 * @returns SendEmailResult with success status and reason
 */
async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
	try {
		// Config load lives inside the try so a DB hiccup is handled like any send failure
		const smtpConfig = await getSmtpConfig();
		if (
			!smtpConfig.host ||
			!smtpConfig.fromAddress ||
			!smtpConfig.user ||
			!smtpConfig.password
		) {
			logger.warn('SMTP is not configured. Email not sent.');
			return { reason: 'not_configured', success: false };
		}

		const configKey = `${smtpConfig.host}:${smtpConfig.port}:${smtpConfig.user}:${smtpConfig.secure}`;
		if (!cachedTransporter || configKey !== cachedConfigKey) {
			cachedTransporter = nodemailer.createTransport({
				auth:
					smtpConfig.user.length > 0
						? { pass: smtpConfig.password, user: smtpConfig.user }
						: undefined,
				host: smtpConfig.host,
				pool: true,
				port: smtpConfig.port,
				secure: smtpConfig.secure,
			});
			cachedConfigKey = configKey;
		}

		await cachedTransporter.sendMail({
			from: { address: smtpConfig.fromAddress, name: smtpConfig.fromName },
			html: input.html,
			subject: input.subject,
			text: input.text,
			to: input.to,
		});
		logger.info({ subject: input.subject }, 'Email sent successfully');
		return { reason: 'sent', success: true };
	} catch (err) {
		logger.error({ err }, 'Failed to send email');
		cachedTransporter = null;
		cachedConfigKey = '';
		return {
			error: err instanceof Error ? err : new Error(String(err)),
			reason: 'send_failed',
			success: false,
		};
	}
}

export { sendEmail };

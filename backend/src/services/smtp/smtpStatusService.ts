import type { SmtpConfig } from './smtpConfigService.ts';

import { Type } from '../../config/configSchemaHelpers.ts';
import { parseSettingsJson } from '../../utils/validation.ts';
import { getByKeyRaw, update } from '../settingsService.ts';
import {
	DEFAULT_SMTP_CONFIG,
	ensureSmtpConfigSeeded,
	SMTP_CONFIG_KEY,
	SmtpConfigSchema as FullSmtpConfigSchema,
} from './smtpConfigService.ts';

const SmtpCredentialsSchema = Type.Pick(FullSmtpConfigSchema, [
	'fromAddress',
	'host',
	'password',
	'user',
]);

const SmtpTestResultSchema = Type.Object({
	sentAt: Type.Optional(Type.String()),
	success: Type.Optional(Type.Boolean()),
});

interface EmailStatus {
	canSend: boolean;
	configured: boolean;
	lastTestAt: null | string;
	lastTestSuccess: boolean;
}

interface SmtpTestResult {
	sentAt: string;
	success: boolean;
}

const DEFAULT_SMTP_CREDENTIALS: Pick<SmtpConfig, 'fromAddress' | 'host' | 'password' | 'user'> = {
	fromAddress: DEFAULT_SMTP_CONFIG.fromAddress,
	host: DEFAULT_SMTP_CONFIG.host,
	password: DEFAULT_SMTP_CONFIG.password,
	user: DEFAULT_SMTP_CONFIG.user,
};

/**
 * Check if SMTP credentials are configured without decrypting the password.
 * Reads the raw JSON and checks field presence/non-emptiness.
 * @returns true if all required SMTP fields (host, fromAddress, user, password) are non-empty
 */
function hasSmtpCredentials(): boolean {
	ensureSmtpConfigSeeded();
	const setting = getByKeyRaw(SMTP_CONFIG_KEY);
	if (!setting?.value) return false;

	const parsed = parseSettingsJson(
		setting.value,
		SmtpCredentialsSchema,
		DEFAULT_SMTP_CREDENTIALS,
		'SMTP config'
	);

	return Boolean(parsed.host && parsed.fromAddress && parsed.user && parsed.password);
}

function isSmtpConfigured(): boolean {
	return hasSmtpCredentials();
}

async function getEmailStatus(): Promise<EmailStatus> {
	const configured = hasSmtpCredentials();
	let lastTestAt = null;
	let lastTestSuccess = false;

	const lastTestSetting = getByKeyRaw('smtp_last_test');
	if (lastTestSetting?.value) {
		const testResult = parseSettingsJson(
			lastTestSetting.value,
			SmtpTestResultSchema,
			{ sentAt: '', success: false },
			'SMTP test result'
		);
		lastTestAt = testResult.sentAt || null;
		lastTestSuccess = testResult.success;
	}

	return {
		canSend: configured,
		configured,
		lastTestAt,
		lastTestSuccess,
	};
}

function recordTestResult(success: boolean, userId: number): void {
	const testResult: SmtpTestResult = {
		sentAt: new Date().toISOString(),
		success,
	};

	update({
		description: 'SMTP test email result',
		key: 'smtp_last_test',
		updatedBy: userId,
		value: JSON.stringify(testResult),
	});
}

export { getEmailStatus, hasSmtpCredentials, isSmtpConfigured, recordTestResult };

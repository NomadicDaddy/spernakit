import type { DataResponse } from './types';

import { apiClient } from './client';

interface SmtpConfig {
	fromAddress: string;
	fromName: string;
	host: string;
	password: string;
	port: number;
	secure: boolean;
	user: string;
}

interface EmailStatus {
	canSend: boolean;
	configured: boolean;
	lastTestAt: null | string;
	lastTestSuccess: boolean;
}

interface TestEmailRequest {
	message?: string;
	subject?: string;
	testEmail: string;
}

async function getSmtpConfig(): Promise<DataResponse<SmtpConfig>> {
	return apiClient.get<DataResponse<SmtpConfig>>('/settings/smtp/config');
}

async function updateSmtpConfig(config: Partial<SmtpConfig>): Promise<DataResponse<SmtpConfig>> {
	return apiClient.put<DataResponse<SmtpConfig>>('/settings/smtp/config', { body: config });
}

async function sendSmtpTestEmail(
	request: TestEmailRequest
): Promise<DataResponse<{ success: boolean }>> {
	return apiClient.post<DataResponse<{ success: boolean }>>('/settings/smtp/test', {
		body: request,
	});
}

async function getEmailStatus(): Promise<DataResponse<EmailStatus>> {
	return apiClient.get<DataResponse<EmailStatus>>('/settings/email/status');
}

export { getEmailStatus, getSmtpConfig, sendSmtpTestEmail, updateSmtpConfig };
export type { EmailStatus, SmtpConfig };

import type { DataResponse, ErrorCode, ErrorResponse, RoleLabels, UserRole } from '@/api/types';

import { ApiError, apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

interface LoginRequest {
	password: string;
	username: string;
}

interface RegisterRequest {
	confirmPassword: string;
	email: string;
	password: string;
	username: string;
}

interface ResetPasswordRequest {
	confirmPassword: string;
	password: string;
	token: string;
}

interface UserData {
	email: string;
	id: number;
	impersonatedBy?: null | number;
	requiresPasswordChange?: boolean;
	role: UserRole;
	roleLabels?: RoleLabels;
	username: string;
}

type LoginResult = { kind: 'mfa'; mfaToken: string } | { kind: 'success'; user: UserData };

interface MfaChallengeResponse {
	mfaRequired: true;
	mfaToken: string;
}

function isMfaChallengeResponse(
	data: MfaChallengeResponse | UserData
): data is MfaChallengeResponse {
	return 'mfaRequired' in data && data.mfaRequired === true;
}

/**
 * Send login credentials to backend.
 * Uses postWithResponse to extract CSRF token from response headers.
 *
 * @param data - Username and password
 * @returns Either full user profile (login complete) or an MFA challenge token
 */
async function login(data: LoginRequest): Promise<LoginResult> {
	const response = await apiClient.postWithResponse('/auth/login', { body: data });

	if (!response.ok) {
		let message = 'Login failed';
		let code: ErrorCode | undefined;
		let requestId: string | undefined;
		let details: Record<string, unknown> | undefined;
		try {
			const body = (await response.json()) as ErrorResponse;
			message = body.message ?? body.error ?? message;
			code = body.code;
			requestId = body.requestId;
			details = body.details;
		} catch {
			// Response body wasn't JSON
		}
		throw new ApiError(message, response.status, code, requestId, details);
	}

	const body = (await response.json()) as DataResponse<MfaChallengeResponse | UserData>;

	if (isMfaChallengeResponse(body.data)) {
		return { kind: 'mfa', mfaToken: body.data.mfaToken };
	}

	const csrfToken = response.headers.get('X-CSRF-Token');
	if (csrfToken) {
		const { setCsrfToken } = useAuthStore.getState();
		setCsrfToken(csrfToken);
	}

	return { kind: 'success', user: body.data };
}

/**
 * Send logout request to backend.
 */
async function logout(): Promise<void> {
	await apiClient.post('/auth/logout');
}

/**
 * Get current authenticated user from backend.
 *
 * @returns User data or null if not authenticated
 */
async function getMe(): Promise<null | UserData> {
	try {
		const body = await apiClient.get<DataResponse<UserData>>('/auth/me');
		return body.data;
	} catch (err) {
		// Rethrow non-auth errors (429, 500, network) so callers can distinguish
		// transient failures from genuine auth failures (401/403)
		if (err instanceof ApiError && err.status !== 401 && err.status !== 403) {
			throw err;
		}
		return null;
	}
}

interface RegisterResponse {
	success: boolean;
}

async function register(data: RegisterRequest): Promise<RegisterResponse> {
	return apiClient.post<RegisterResponse>('/auth/register', { body: data });
}

interface ForgotPasswordResponse {
	message: string;
}

async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
	return apiClient.post<ForgotPasswordResponse>('/auth/forgot-password', { body: { email } });
}

interface ResetPasswordResponse {
	message: string;
}

async function resetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
	return apiClient.post<ResetPasswordResponse>('/auth/reset-password', { body: data });
}

interface VerifyEmailResponse {
	data: null;
}

async function verifyEmailToken(token: string): Promise<VerifyEmailResponse> {
	return apiClient.post<VerifyEmailResponse>('/auth/verify-email', { body: { token } });
}

interface ConfirmEmailChangeResponse {
	data: null;
}

async function confirmEmailChangeToken(token: string): Promise<ConfirmEmailChangeResponse> {
	return apiClient.post<ConfirmEmailChangeResponse>('/auth/confirm-email-change', {
		body: { token },
	});
}

interface RegistrationStatusResponse {
	enabled: boolean;
	/** Effective server-side special-character requirement, so client validation matches. */
	requireSpecialCharacter: boolean;
}

async function getRegistrationStatus(): Promise<RegistrationStatusResponse> {
	const res = await apiClient.get<DataResponse<RegistrationStatusResponse>>(
		'/auth/registration-status'
	);
	return res.data;
}

export {
	confirmEmailChangeToken,
	forgotPassword,
	getMe,
	getRegistrationStatus,
	login,
	logout,
	register,
	resetPassword,
	verifyEmailToken,
};
export type { LoginRequest, LoginResult, UserData };

import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	PASSWORD_RESET_CONFIRM_IP_MAX_REQUESTS,
	PASSWORD_RESET_CONFIRM_IP_WINDOW_MS,
	PASSWORD_RESET_EMAIL_MAX_REQUESTS,
	PASSWORD_RESET_EMAIL_WINDOW_MS,
	PASSWORD_RESET_IP_MAX_REQUESTS,
	PASSWORD_RESET_IP_WINDOW_MS,
} from '../../constants/rateLimit.ts';
import {
	badRequestExample,
	RATE_LIMITED_EXAMPLE,
	SUCCESS_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import {
	EMAIL_MAX_LENGTH,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
} from '../../constants/validation.ts';
import { authPlugin } from '../../plugins/auth.ts';
import {
	checkRouteLimit,
	createRateLimitStore,
	isRateLimitBypassed,
} from '../../plugins/rateLimit/index.ts';
import {
	getAuthSettings,
	requestPasswordReset,
	resetPassword,
} from '../../services/authService.ts';
import { sendPasswordResetEmail } from '../../services/emailService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import { validatePasswordStrength } from '../../utils/auth/passwordValidation.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import { sendEmailWithRetry } from '../../utils/emailRetry.ts';
import {
	AUTH_ERROR_CODES,
	RATE_ERROR_CODES,
	rateLimitError,
	VALIDATION_ERROR_CODES,
	badRequestError,
} from '../../utils/errorResponse.ts';
import { logger } from '../../utils/logger.ts';

const resetStore = createRateLimitStore();

interface ForgotPasswordBody {
	email: string;
}

interface ForgotPasswordContext {
	body: ForgotPasswordBody;
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}

async function handleForgotPassword({ body, request, set }: ForgotPasswordContext) {
	if (!isRateLimitBypassed()) {
		resetStore.startCleanup();
		const ip = getClientIp(request);
		const ipResult = checkRouteLimit(
			resetStore,
			`pwd-reset-ip:${ip}`,
			PASSWORD_RESET_IP_MAX_REQUESTS,
			PASSWORD_RESET_IP_WINDOW_MS
		);
		if (ipResult.limited) {
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			set.headers['Retry-After'] = String(ipResult.retryAfter ?? 0);
			return rateLimitError(
				ipResult.retryAfter ?? 0,
				RATE_ERROR_CODES.RATE_PASSWORD_RESET_LIMIT_EXCEEDED
			);
		}

		const normalizedEmail = body.email.toLowerCase().trim();
		const emailResult = checkRouteLimit(
			resetStore,
			`pwd-reset-email:${normalizedEmail}`,
			PASSWORD_RESET_EMAIL_MAX_REQUESTS,
			PASSWORD_RESET_EMAIL_WINDOW_MS
		);
		if (emailResult.limited) {
			// Silently skip to prevent email enumeration — still return success.
			// Do not log the email address itself (PII / enumeration safety).
			logger.warn('Password reset email rate limit hit - silently skipping');
			return successResponse();
		}
	}

	const result = requestPasswordReset(body.email);

	if (result) {
		// Fire-and-forget — return success immediately to prevent email enumeration timing leaks.
		// Do not include email or token in the log context to preserve email-enumeration safety.
		void sendEmailWithRetry('password-reset', () =>
			sendPasswordResetEmail(body.email, result.token)
		).catch((err) => {
			logger.error({ err }, 'Failed to send password reset email');
		});
		logger.info('Password reset requested');
	}

	return successResponse();
}

interface ResetPasswordBody {
	password: string;
	token: string;
}

interface ResetPasswordContext {
	body: ResetPasswordBody;
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}

async function handleResetPassword({ body, request, set }: ResetPasswordContext) {
	if (!isRateLimitBypassed()) {
		resetStore.startCleanup();
		const ip = getClientIp(request);
		const ipResult = checkRouteLimit(
			resetStore,
			`pwd-confirm-ip:${ip}`,
			PASSWORD_RESET_CONFIRM_IP_MAX_REQUESTS,
			PASSWORD_RESET_CONFIRM_IP_WINDOW_MS
		);
		if (ipResult.limited) {
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			set.headers['Retry-After'] = String(ipResult.retryAfter ?? 0);
			return rateLimitError(
				ipResult.retryAfter ?? 0,
				RATE_ERROR_CODES.RATE_PASSWORD_RESET_LIMIT_EXCEEDED
			);
		}
	}

	const { requireSpecialCharacter } = getAuthSettings();
	const passwordError = validatePasswordStrength(body.password, {
		requireSpecialCharacter,
	});
	if (passwordError) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(passwordError, VALIDATION_ERROR_CODES.VALIDATION_WEAK_PASSWORD);
	}

	const result = await resetPassword(body.token, body.password);

	if (!result.success) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		if (result.reason === SERVICE_ERRORS.PASSWORD_HISTORY) {
			return badRequestError(
				'This password was used recently. Please choose a different password.',
				VALIDATION_ERROR_CODES.VALIDATION_WEAK_PASSWORD
			);
		}
		if (result.reason === SERVICE_ERRORS.PASSWORD_AGE) {
			return badRequestError(
				'Password was changed too recently. Please wait before changing it again.',
				VALIDATION_ERROR_CODES.VALIDATION_WEAK_PASSWORD
			);
		}
		return badRequestError(
			'Invalid or expired reset token',
			AUTH_ERROR_CODES.AUTH_RESET_TOKEN_INVALID
		);
	}

	return successResponse();
}

const authPasswordResetRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' })
	.use(authPlugin)
	.post('/forgot-password', handleForgotPassword, {
		body: t.Object({
			email: t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH, minLength: 1 }),
		}),
		detail: {
			description:
				'Sends a password reset email to provided address. Always returns ' +
				'success to prevent email enumeration - even if the email does not exist. ' +
				'Requires SMTP to be configured. The reset token expires after a ' +
				'configurable duration.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'Request accepted (always succeeds to prevent enumeration).',
				},
				'429': RATE_LIMITED_EXAMPLE,
			},
			summary: 'Request a password reset email',
		},
	})
	.post('/reset-password', handleResetPassword, {
		body: t.Object({
			password: t.String({
				maxLength: PASSWORD_MAX_LENGTH,
				minLength: PASSWORD_MIN_LENGTH,
			}),
			token: t.String({ maxLength: 512, minLength: 1 }),
		}),
		detail: {
			description:
				'Completes a password reset using the token from the reset email. The new ' +
				'password must be 8-128 characters. Returns 400 with ' +
				'AUTH_RESET_TOKEN_INVALID if token is expired or already used. On ' +
				'success, the old refresh token is invalidated and the user must log in again.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'Password reset successful.',
				},
				'400': badRequestExample(
					'Invalid or expired reset token',
					'AUTH_RESET_TOKEN_INVALID'
				),
				'429': RATE_LIMITED_EXAMPLE,
			},
			summary: 'Reset password with token',
		},
	});

export { authPasswordResetRoutes };

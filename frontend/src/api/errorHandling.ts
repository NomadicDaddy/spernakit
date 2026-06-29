import { toast } from 'sonner';

import type { ErrorCode } from './types';

const ERROR_CODE_MESSAGES: Partial<Record<ErrorCode, string>> = {
	AUTH_ACCOUNT_DELETED: 'This account has been deleted.',
	AUTH_ACCOUNT_LOCKED: 'Account locked due to too many failed attempts.',
	AUTH_INVALID_CREDENTIALS: 'Invalid username or password. Check your credentials and try again.',
	AUTH_PASSWORD_CHANGE_REQUIRED: 'Please change your default password before continuing.',
	AUTH_PASSWORD_EXPIRED: 'Your password has expired. Please reset your password.',
	AUTH_PERMISSION_DENIED:
		'You do not have permission. Contact an administrator if you believe this is an error.',
	AUTH_TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
	AUTH_TOKEN_REVOKED: 'Your session was invalidated. Please sign in again.',
	AUTH_WORKSPACE_ACCESS_DENIED: 'You do not have access to this workspace.',
	RATE_LOGIN_LIMIT_EXCEEDED: 'Too many login attempts. Please wait before trying again.',
	RESOURCE_ALREADY_EXISTS:
		'A resource with that identifier already exists. Use a different name or identifier.',
	RESOURCE_NOT_FOUND:
		'The requested resource was not found. It may have been deleted or the URL is incorrect.',
	SERVER_INTERNAL_ERROR: 'A server error occurred. Please try again later.',
};

/** Error codes whose backend message is safe to display verbatim to the user. */
const SAFE_MESSAGE_CODES = new Set<ErrorCode>([
	'AUTH_ACCOUNT_DELETED',
	'AUTH_ACCOUNT_LOCKED',
	'AUTH_CSRF_ORIGIN_REJECTED',
	'AUTH_CSRF_TOKEN_INVALID',
	'AUTH_INVALID_CREDENTIALS',
	'AUTH_PASSWORD_EXPIRED',
	'AUTH_RESET_TOKEN_INVALID',
	'AUTH_VERIFICATION_TOKEN_INVALID',
	'RATE_LOGIN_LIMIT_EXCEEDED',
	'RESOURCE_ALREADY_EXISTS',
	'VALIDATION_WEAK_PASSWORD',
]);

/**
 * Get a user-safe error message from a caught error.
 * Uses error code mapping for known codes, passes through safe messages,
 * and falls back to a generic message for unknown errors.
 *
 * @param err - Caught error value
 * @param fallback - Generic fallback message
 * @returns User-safe error message
 */
function getSafeErrorMessage(err: unknown, fallback: string): string {
	if (!(err instanceof Error)) return fallback;

	// Check for ApiError with typed code
	if ('code' in err) {
		const code = (err as { code?: ErrorCode }).code;
		if (code) {
			const mapped = ERROR_CODE_MESSAGES[code];
			if (mapped) return mapped;
			if (SAFE_MESSAGE_CODES.has(code)) return err.message;
		}
	}

	return fallback;
}

const RATE_LIMIT_CODES: ErrorCode[] = ['RATE_API_LIMIT_EXCEEDED', 'RATE_LIMIT_EXCEEDED'];

export { getSafeErrorMessage };

/**
 * HTTP 400 is intentionally omitted: per-call onError handlers are responsible
 * for user-facing messaging on validation failures so generic toasts do not
 * drown out field-specific errors.
 */
const STATUS_MESSAGES = new Map<number, string>([
	[401, 'Session expired. Please sign in again.'],
	[403, 'You do not have permission to perform this action.'],
	[429, 'Too many requests. Please try again later.'],
]);

/** Guard to prevent duplicate toasts from concurrent 403 responses. */
let passwordChangeToastShown = false;

/** Reset the password-change toast guard (call on logout / password change). */
function resetPasswordChangeToast(): void {
	passwordChangeToastShown = false;
}

function showRateLimitToast(details?: Record<string, unknown>): void {
	const retryAfter = details?.retryAfter as number | undefined;
	toast.error(
		retryAfter
			? `Too many requests. Try again in ${retryAfter} seconds.`
			: 'Too many requests. Please try again later.'
	);
}

/**
 * Show appropriate toast message based on error code or status.
 * Error codes take precedence over status codes for more specific messages.
 */
function showErrorToast(status: number, code?: ErrorCode, details?: Record<string, unknown>): void {
	if (code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
		if (!passwordChangeToastShown) {
			passwordChangeToastShown = true;
			toast.error(ERROR_CODE_MESSAGES.AUTH_PASSWORD_CHANGE_REQUIRED);
		}
		return;
	}

	if (code) {
		const message = ERROR_CODE_MESSAGES[code];
		if (message) {
			toast.error(message);
			return;
		}
		if (RATE_LIMIT_CODES.includes(code)) {
			showRateLimitToast(details);
			return;
		}
	}

	const statusMessage = STATUS_MESSAGES.get(status);
	if (statusMessage) {
		toast.error(statusMessage);
	} else if (status >= 500) {
		toast.error('A server error occurred. Please try again later.');
	}
}

export { resetPasswordChangeToast, showErrorToast };

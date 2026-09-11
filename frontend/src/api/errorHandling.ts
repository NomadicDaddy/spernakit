import { lazyToast } from '@/lib/lazyToast';

import type { ErrorCode } from './types';

const ERROR_CODE_MESSAGES: Partial<Record<ErrorCode, string>> = {
	AUTH_ACCOUNT_DELETED: 'This account has been deleted.',
	AUTH_ACCOUNT_LOCKED: 'Account locked due to too many failed attempts.',
	AUTH_CURRENT_PASSWORD_INVALID: 'Current password is incorrect.',
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
	RESOURCE_PROTECTED: 'That item is protected and cannot be changed or removed.',
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
	'RESOURCE_PROTECTED',
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
 * HTTP 400 is intentionally omitted here: a mutation that fails validation is answering a form,
 * and that form's per-field messages say more than a generic toast can, so a toast on top of them
 * only repeats the failure less precisely. A failed query has no form behind it, which is what
 * `showQueryErrorToast` below exists to cover.
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

function rateLimitMessage(details?: Record<string, unknown>): string {
	const retryAfter = details?.retryAfter as number | undefined;
	return retryAfter
		? `Too many requests. Try again in ${retryAfter} seconds.`
		: 'Too many requests. Please try again later.';
}

/**
 * The toast text for a failed response, or nothing when this failure has no global message.
 *
 * Error codes take precedence over status codes, since a code names the specific thing that went
 * wrong and a status only names the category.
 */
function resolveToastMessage(
	status: number,
	code?: ErrorCode,
	details?: Record<string, unknown>,
): null | string {
	if (code) {
		const message = ERROR_CODE_MESSAGES[code];
		if (message) return message;
		if (RATE_LIMIT_CODES.includes(code)) return rateLimitMessage(details);
	}

	const statusMessage = STATUS_MESSAGES.get(status);
	if (statusMessage) return statusMessage;
	if (status >= 500) return 'A server error occurred. Please try again later.';
	return null;
}

/**
 * Show appropriate toast message based on error code or status.
 * Error codes take precedence over status codes for more specific messages.
 */
function showErrorToast(status: number, code?: ErrorCode, details?: Record<string, unknown>): void {
	if (code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
		if (!passwordChangeToastShown) {
			passwordChangeToastShown = true;
			lazyToast.error(ERROR_CODE_MESSAGES.AUTH_PASSWORD_CHANGE_REQUIRED ?? '');
		}
		return;
	}

	const message = resolveToastMessage(status, code, details);
	if (message) lazyToast.error(message);
}

/**
 * What a failed GET says when nothing else will say anything.
 *
 * A page reaches a 400 on a read by sending what the address told it to send, so the values worth
 * naming are the ones in the address. The message has to carry the whole explanation: the page it
 * belongs to renders its normal empty state rather than an error, which is deliberate, and that
 * empty state cannot tell a filter that matched nothing from a filter the server rejected.
 */
const BAD_REQUEST_QUERY_MESSAGE =
	'The server rejected this request. A filter or page setting in the address may no longer be valid; clear the filters and try again.';

/**
 * Show the toast for a failed query rather than a failed mutation.
 *
 * Identical to `showErrorToast` except for 400, which the map above leaves deliberately silent so a
 * form's own field-level messages are not drowned out by a generic one. A query has no form behind
 * it and no fields to mark, so the same silence leaves the failure completely unreported: the
 * request was refused, the page renders empty, and nothing anywhere says why.
 */
function showQueryErrorToast(
	status: number,
	code?: ErrorCode,
	details?: Record<string, unknown>,
): void {
	if (status === 400 && resolveToastMessage(status, code, details) === null) {
		lazyToast.error(BAD_REQUEST_QUERY_MESSAGE);
		return;
	}
	showErrorToast(status, code, details);
}

export { resetPasswordChangeToast, showErrorToast, showQueryErrorToast };

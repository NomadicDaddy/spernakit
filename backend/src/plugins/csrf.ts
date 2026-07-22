import { Elysia } from 'elysia';

import type { AuthPayload } from './auth.ts';

import { getConfig } from '../config/configLoader.ts';
import { AUTH_ERROR_CODES } from '../constants/errorCodes.ts';
import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { getCsrfSecret, setCsrfSecret } from '../services/userService.ts';
import { unauthorizedError } from '../utils/errorResponse.ts';
import { logger } from '../utils/logger.ts';
import { isOriginAllowed } from '../utils/originValidation.ts';
import {
	deriveCsrfToken,
	generateCsrfSecret,
	isCsrfTokenExpired,
	verifyCsrfSignature,
} from './csrf-tokens.ts';

/**
 * Ensure a user has a CSRF signing secret stored. If not, generate and store one.
 * Returns the raw secret for token derivation.
 */
async function ensureCsrfSecret(userId: number): Promise<string> {
	const existing = getCsrfSecret(userId);
	if (existing) {
		return existing;
	}

	const secret = generateCsrfSecret();
	setCsrfSecret(userId, secret);
	return secret;
}

/**
 * Generate a session-unique CSRF token for a user.
 * Uses a per-user signing secret stored in the database.
 */
async function generateAndStoreCsrfToken(userId: number): Promise<string> {
	const secret = await ensureCsrfSecret(userId);
	return deriveCsrfToken(secret);
}

/**
 * Fetch the stored CSRF signing secret for a user from the database.
 */
async function fetchStoredCsrfSecret(userId: number): Promise<null | string> {
	const secret = getCsrfSecret(userId);
	if (secret === null) {
		logger.warn({ userId }, 'User not found or CSRF secret not set');
	}
	return secret;
}

/**
 * Validate CSRF token from request against stored secret for user.
 * Checks both HMAC signature validity and expiration based on configured TTL.
 */
async function validateCsrfToken(
	providedToken: null | string,
	user: AuthPayload
): Promise<boolean> {
	if (!user || !user.id) return false;

	if (!providedToken) {
		logger.debug({ userId: user.id }, 'CSRF token missing from request');
		return false;
	}

	const storedSecret = await fetchStoredCsrfSecret(user.id);
	if (!storedSecret) return false;

	if (!verifyCsrfSignature(providedToken, storedSecret)) {
		logger.warn({ userId: user.id }, 'CSRF token mismatch - potential attack');
		return false;
	}

	if (isCsrfTokenExpired(providedToken)) {
		logger.debug({ userId: user.id }, 'CSRF token expired');
		return false;
	}

	return true;
}

/**
 * Resolve the request origin from either the Origin or Referer header.
 */
function resolveRequestOrigin(request: Request): null | string {
	const origin = request.headers.get('origin');
	if (origin) return origin;

	const referer = request.headers.get('referer');
	if (referer) return new URL(referer).origin;

	return null;
}

/**
 * Validate origin for unauthenticated state-changing requests.
 */
function validateUnauthenticatedOrigin(
	request: Request,
	set: { status?: number | string }
): ReturnType<typeof unauthorizedError> | undefined {
	const config = getConfig();
	let requestOrigin: null | string;
	let originResolutionFailed = false;

	try {
		requestOrigin = resolveRequestOrigin(request);
	} catch (err) {
		logger.warn({ err }, 'CSRF origin resolution failed - malformed request headers');
		requestOrigin = null;
		originResolutionFailed = true;
	}

	if (requestOrigin) {
		if (!isOriginAllowed(requestOrigin, config)) {
			const headerUsed = request.headers.get('origin') ? 'Origin' : 'Referer';
			logger.warn(
				{ origin: requestOrigin },
				`Rejected cross-origin unauthenticated POST (via ${headerUsed})`
			);
			set.status = HTTP_STATUS.FORBIDDEN;
			return unauthorizedError(
				'Cross-origin request rejected',
				AUTH_ERROR_CODES.AUTH_CSRF_ORIGIN_REJECTED
			);
		}
		return undefined;
	}

	if (originResolutionFailed) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return unauthorizedError(
			'Invalid request headers',
			AUTH_ERROR_CODES.AUTH_CSRF_ORIGIN_REJECTED
		);
	}

	if (!config.cors.allowNoOrigin) {
		logger.debug('Rejected unauthenticated POST: no Origin or Referer');
		set.status = HTTP_STATUS.FORBIDDEN;
		return unauthorizedError(
			'Origin header required',
			AUTH_ERROR_CODES.AUTH_CSRF_ORIGIN_REJECTED
		);
	}

	return undefined;
}

/** HTTP methods that require CSRF validation. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Auth infrastructure paths exempt from CSRF token validation (exact match).
 * Logout is intentionally NOT exempt — it requires a valid CSRF token to prevent
 * forced-logout attacks. The handler gracefully handles missing/expired auth tokens.
 *
 * Password-reset endpoints are anonymous by design and cannot satisfy a session-bound
 * CSRF token; they fall through to validateUnauthenticatedOrigin() for protection.
 */
const CSRF_EXEMPT_PATHS = new Set([
	'/api/v1/auth/forgot-password',
	'/api/v1/auth/login',
	'/api/v1/auth/refresh',
	'/api/v1/auth/reset-password',
]);

/**
 * Elysia plugin that validates CSRF tokens on state-changing requests.
 */
const csrfPlugin = new Elysia({ name: 'csrf' }).onBeforeHandle({ as: 'scoped' }, async (ctx) => {
	const { request, set } = ctx;
	const method = request.method.toUpperCase();

	if (!STATE_CHANGING_METHODS.has(method)) {
		return undefined;
	}

	const pathname = new URL(request.url).pathname;
	if (CSRF_EXEMPT_PATHS.has(pathname)) {
		return validateUnauthenticatedOrigin(request, set);
	}

	const user = 'user' in ctx ? (ctx.user as AuthPayload | null) : null;

	// Header-based API-key auth cannot be forged cross-origin by a browser,
	// so CSRF token validation does not apply to API-key requests.
	if (user?.isApiKey) {
		return undefined;
	}

	if (!user || !user.id) {
		return validateUnauthenticatedOrigin(request, set);
	}

	const providedToken = request.headers.get('X-CSRF-Token');
	const isValid = await validateCsrfToken(providedToken, user);

	if (!isValid) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return unauthorizedError('CSRF validation failed', 'AUTH_CSRF_TOKEN_INVALID');
	}

	return undefined;
});

export { csrfPlugin, generateAndStoreCsrfToken };

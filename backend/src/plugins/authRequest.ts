import type { ApiKeyScope } from '../types/apiKeys.ts';
import type { UserRole } from '../types/roles.ts';
import type { AuthPayload } from './authTokens.ts';

import { getConfig } from '../config/configLoader.ts';
import { validateApiKey } from '../services/apiKeyService.ts';
import { ROLE_HIERARCHY } from '../types/roles.ts';
import { isTokenRevoked, isUserTokensRevokedAfter } from '../utils/auth/tokenBlacklist.ts';
import { logger } from '../utils/logger.ts';
import { parseCookies, verifyAccessToken } from './authTokens.ts';

const apiKeyScopeToRole: Record<ApiKeyScope, UserRole> = {
	admin: 'ADMIN',
	read: 'VIEWER',
	write: 'OPERATOR',
};

/**
 * Request-scoped cache of resolved API-key users, keyed by Request identity.
 * Populated by resolveApiKeyUser (called from authPlugin's derive) and read by
 * later lifecycle hooks (e.g., the audit plugin's onAfterResponse) that cannot
 * re-run validation — HMAC nonces are single-use, so re-validating would fail.
 * Mirrors the WeakMap pattern used by utils/clientIp.ts.
 */
const apiKeyUserByRequest = new WeakMap<Request, AuthPayload>();

/** Return the API-key user already resolved for this request, if any. */
function getResolvedApiKeyUser(request: Request): AuthPayload | null {
	return apiKeyUserByRequest.get(request) ?? null;
}

/**
 * Request-scoped cache of identities established *during* the handler rather
 * than carried in on the request. Sign-in style routes authenticate a caller and
 * set the auth cookie on the RESPONSE, so at onAfterResponse there is nothing on
 * the Request to resolve and the audit row lands with no actor. Those handlers
 * publish the identity here instead. Mirrors apiKeyUserByRequest above.
 */
const handlerUserByRequest = new WeakMap<Request, AuthPayload>();

/** Record the identity a handler established for this request. */
function publishResolvedUser(request: Request, payload: AuthPayload): void {
	handlerUserByRequest.set(request, payload);
}

/** Return the identity a handler established for this request, if any. */
function getHandlerResolvedUser(request: Request): AuthPayload | null {
	return handlerUserByRequest.get(request) ?? null;
}

function resolveUserFromRequest(request: Request): AuthPayload | null {
	const config = getConfig();
	const cookieHeader = request.headers.get('cookie');
	if (!cookieHeader) return null;

	const cookies = parseCookies(cookieHeader);
	const accessToken = cookies[config.security.authCookieName];
	if (!accessToken) return null;

	if (isTokenRevoked(accessToken)) {
		logger.debug('Access token has been revoked');
		return null;
	}

	const payload = verifyAccessToken(accessToken);
	if (!payload) {
		logger.debug('Invalid or expired access token');
		return null;
	}

	const iat = (payload as { iat?: number } & AuthPayload).iat;
	if (iat && isUserTokensRevokedAfter(payload.id, new Date(iat * 1000))) {
		logger.debug({ userId: payload.id }, 'User tokens revoked after token issuance');
		return null;
	}

	return payload;
}

/**
 * Strict integer parse of a single-value request header. Number.parseInt alone would accept
 * "2abc" as 2, leaking a malformed header through as a valid value.
 *
 * @param raw - Raw header value or null when absent
 * @returns The parsed integer, or NaN when the value is not a bare run of digits
 */
function parseStrictInteger(raw: null | string): number {
	return raw !== null && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
}

/**
 * The four signing headers a request must carry alongside X-API-Key. `null` from `header()` means
 * the set is incomplete - a missing header or an empty value, which is the same missing header.
 */
interface SigningHeaders {
	nonce: string;
	signature: string;
	timestamp: string;
	version: string;
}

/**
 * Read the mandatory signing headers, or null when any is missing or empty.
 *
 * Request signing is mandatory (the 2026-10-20 SECURITY audit High, residual items 1 and 2): an
 * API key alone never authenticates, and there is no unsigned fallback to fall back to. An
 * incomplete set is an invalid request, resolved to no user so requireAuth answers 401.
 *
 * @param request - The request carrying the X-API-Key header
 * @returns All four header values, or null when the signing set is incomplete
 */
function readSigningHeaders(request: Request): null | SigningHeaders {
	const signature = request.headers.get('x-api-signature');
	const timestamp = request.headers.get('x-api-timestamp');
	const nonce = request.headers.get('x-api-nonce');
	const version = request.headers.get('x-api-version');
	if (!signature || !timestamp || !nonce || !version) return null;
	return { nonce, signature, timestamp, version };
}

async function resolveApiKeyUser(
	request: Request,
	apiKeyHeader: string,
): Promise<AuthPayload | null> {
	const signing = readSigningHeaders(request);
	if (!signing) return null;

	const url = new URL(request.url);
	const body = await request.clone().text();
	const validated = await validateApiKey({
		apiKey: apiKeyHeader,
		body,
		method: request.method,
		nonce: signing.nonce,
		path: url.pathname + url.search,
		signature: signing.signature,
		timestamp: parseStrictInteger(signing.timestamp),
		version: parseStrictInteger(signing.version),
	});

	if (!validated) return null;

	// Cap the effective role at the owner's CURRENT role so a key scoped above
	// the owner's present privilege (e.g., after a demotion) cannot escalate.
	const scopeRole = apiKeyScopeToRole[validated.keyScope] ?? 'VIEWER';
	const role =
		ROLE_HIERARCHY[scopeRole] <= ROLE_HIERARCHY[validated.ownerRole]
			? scopeRole
			: validated.ownerRole;

	const user: AuthPayload = {
		id: validated.createdBy,
		isApiKey: true,
		role,
	};
	apiKeyUserByRequest.set(request, user);
	return user;
}

export {
	getHandlerResolvedUser,
	getResolvedApiKeyUser,
	publishResolvedUser,
	resolveApiKeyUser,
	resolveUserFromRequest,
};

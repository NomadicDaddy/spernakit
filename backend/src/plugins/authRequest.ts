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

	const iat = (payload as AuthPayload & { iat?: number }).iat;
	if (iat && isUserTokensRevokedAfter(payload.id, new Date(iat * 1000))) {
		logger.debug({ userId: payload.id }, 'User tokens revoked after token issuance');
		return null;
	}

	return payload;
}

async function resolveApiKeyUser(
	request: Request,
	apiKeyHeader: string
): Promise<AuthPayload | null> {
	const hasHmacHeaders =
		request.headers.get('x-api-signature') !== null &&
		request.headers.get('x-api-timestamp') !== null &&
		request.headers.get('x-api-nonce') !== null;

	let validated;
	if (hasHmacHeaders) {
		const timestamp = Number.parseInt(request.headers.get('x-api-timestamp') ?? '0', 10);
		const url = new URL(request.url);
		const body = await request.clone().text();
		validated = await validateApiKey({
			apiKey: apiKeyHeader,
			body,
			method: request.method,
			nonce: request.headers.get('x-api-nonce') ?? '',
			path: url.pathname + url.search,
			signature: request.headers.get('x-api-signature') ?? '',
			timestamp,
		});
	} else {
		validated = await validateApiKey(apiKeyHeader);
	}

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

export { getResolvedApiKeyUser, resolveApiKeyUser, resolveUserFromRequest };

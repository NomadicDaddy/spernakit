import { Elysia } from 'elysia';

import { resolveApiKeyUser, resolveUserFromRequest } from './authRequest.ts';
import {
	type AuthPayload,
	parseCookies,
	signAccessToken,
	signTokenPair,
	verifyAccessToken,
	verifyRefreshToken,
} from './authTokens.ts';

/**
 * Elysia plugin that derives the authenticated user from HTTP-only JWT cookies
 * OR from a user-minted API key (`X-API-Key` header, optionally paired with
 * HMAC signature headers).
 *
 * API-key authentication is folded into this plugin because named plugins with
 * non-scoped onBeforeHandle do not propagate through nested Elysia instances;
 * keeping the logic inside authPlugin's scoped derive guarantees every route
 * file that does `.use(authPlugin)` also gets the API-key auth path for free.
 *
 * Sets `user` to an AuthPayload if a valid access token or API key is present,
 * or null otherwise. Scoped: types propagate to any Elysia instance that
 * `.use(authPlugin)`.
 */
const authPlugin = new Elysia({ name: 'auth' }).derive({ as: 'scoped' }, async ({ request }) => {
	const apiKeyHeader = request.headers.get('x-api-key');
	if (apiKeyHeader) {
		const user = await resolveApiKeyUser(request, apiKeyHeader);
		if (user) {
			return { user };
		}

		// X-API-Key was present but invalid — fall through so requireAuth emits
		// the standard AUTH_TOKEN_MISSING/AUTH_TOKEN_INVALID rejection.
		return { user: null };
	}

	return { user: resolveUserFromRequest(request) };
});

/**
 * Alias for resolveUserFromRequest.
 * Used for non-critical paths (rate limiting, audit logging) where the
 * full auth plugin derive is not available.
 */
const resolveUserFromCookie = resolveUserFromRequest;

export {
	authPlugin,
	parseCookies,
	resolveUserFromCookie,
	signAccessToken,
	signTokenPair,
	verifyAccessToken,
	verifyRefreshToken,
};
export type { AuthPayload };

import { Elysia } from 'elysia';

import type { UserRole } from '../types/roles.ts';

import { authorizeRequest, type GuardContext } from '../guards/role.ts';
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
 *
 * The plugin also carries the `requireAuth` and `requireRole` route options that guard every
 * protected route. They live here, on the plugin every route file already uses, so that
 * authorization runs before body validation as a property of the application rather than
 * something each route has to remember. See the macro's own comment for why.
 */
const authPlugin = new Elysia({ name: 'auth' })
	.derive({ as: 'scoped' }, async ({ request }) => {
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
	})
	/**
	 * Route options that reject an unauthenticated or under-privileged caller.
	 *
	 * Both hooks run at the transform stage, which is the stage before Elysia validates the
	 * request against the route's schema. That ordering is the point. When these checks lived in
	 * `beforeHandle`, an anonymous caller who posted a malformed body was answered with a 400
	 * describing the schema of a route they were never allowed to reach, and the body of every
	 * rejected request was parsed and checked before anyone asked who was sending it.
	 *
	 * A transform hook cannot short-circuit by returning, so `authorizeRequest` throws; the
	 * `onError` handler in create-api-app.ts turns that into the same 401 or 403 envelope the
	 * guards produced before.
	 *
	 * Attaching them here rather than exporting a separate plugin means a route added later gets
	 * the ordering by writing `requireAuth: true` or `requireRole: 'ADMIN'`, with no second thing
	 * to remember and no per-route flag that can be left off.
	 */
	.macro({
		// Elysia types the macro's transform context with `user` optional and readonly, because a
		// macro is declared without knowing which instances the scoped derive above reached. Both
		// hold at runtime: the derive always sets `user`, and `requireRoleFresh` reassigns it with
		// the role it read back from the database. The cast states that rather than weakening
		// GuardContext, which the beforeHandle guards still rely on.
		requireAuth: (enabled: boolean) => ({
			transform(ctx) {
				if (enabled) authorizeRequest(ctx as GuardContext, null);
			},
		}),
		requireRole: (role: UserRole) => ({
			transform(ctx) {
				authorizeRequest(ctx as GuardContext, role);
			},
		}),
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

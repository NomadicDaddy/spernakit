import jwt from 'jsonwebtoken';

import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { parseCookies, verifyAccessToken } from '../../plugins/auth.ts';
import { isTokenRevoked, isUserTokensRevokedAfter } from '../../utils/auth/tokenBlacklist.ts';
import { logger } from '../../utils/logger.ts';

/** Re-validation interval: check token/user status every 2 minutes on active connections. */
const WS_REVALIDATION_INTERVAL_MS = 120_000;

interface WsContext {
	clientIp?: string;
	connId?: string;
	lastValidatedAt?: number;
	revalTimer?: ReturnType<typeof setInterval>;
	tokenExpiresAt?: number;
	tokenIssuedAt?: Date;
	userId?: number;
	wsUser: AuthPayload | null;
}

/** Type guard to validate the shape of WsContext at the cast boundary. */
function isWsContext(data: unknown): data is WsContext {
	if (data === null || data === undefined || typeof data !== 'object') return false;
	const obj = data as Record<string, unknown>;
	return 'wsUser' in obj;
}

/** Extract typed WsContext from Elysia WebSocket data (single cast point). */
function getWsContext(ws: { data: unknown }): WsContext {
	if (!isWsContext(ws.data)) {
		return { wsUser: null };
	}
	return ws.data;
}

/**
 * Authenticate from cookie header string.
 * Returns AuthPayload if valid, null otherwise.
 */
function authenticateFromCookies(cookieHeader: null | string): AuthPayload | null {
	if (!cookieHeader) return null;

	const config = getConfig();
	const cookies = parseCookies(cookieHeader);
	const accessToken = cookies[config.security.authCookieName];
	if (!accessToken) return null;

	const payload = verifyAccessToken(accessToken);
	if (!payload) return null;

	if (isTokenRevoked(accessToken)) {
		logger.debug({ userId: payload.id }, 'WebSocket: access token has been revoked');
		return null;
	}

	const decoded = jwt.decode(accessToken) as { iat?: number } | null;
	if (decoded?.iat && isUserTokensRevokedAfter(payload.id, new Date(decoded.iat * 1000))) {
		logger.debug({ userId: payload.id }, 'WebSocket: user tokens blanket-revoked');
		return null;
	}

	return payload;
}

export { authenticateFromCookies, getWsContext, WS_REVALIDATION_INTERVAL_MS };
export type { WsContext };

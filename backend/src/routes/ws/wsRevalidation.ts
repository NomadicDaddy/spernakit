import jwt from 'jsonwebtoken';

import { getConfig } from '../../config/configLoader.ts';
import { parseCookies } from '../../plugins/auth.ts';
import { getUserAccountStatus } from '../../services/userService.ts';
import {
	hashToken,
	isTokenHashRevoked,
	isUserTokensRevokedAfter,
} from '../../utils/auth/tokenBlacklist.ts';
import { logger } from '../../utils/logger.ts';
import {
	WS_REVALIDATION_INTERVAL_MS,
	WS_REVALIDATION_JITTER_MS,
	type WsContext,
} from './wsAuth.ts';

interface TokenState {
	accessTokenHash: string | undefined;
	tokenExpiresAt: number | undefined;
	tokenIssuedAt: Date | undefined;
}

const NO_TOKEN: TokenState = {
	accessTokenHash: undefined,
	tokenExpiresAt: undefined,
	tokenIssuedAt: undefined,
};

/**
 * What revalidation needs to remember about the access token a socket was opened with: its
 * expiry and issue time, for the expiry and blanket-revocation checks, and its hash, for the
 * individual-revocation check. The raw token itself is not kept.
 */
function extractTokenState(cookieHeader: null | string): TokenState {
	if (!cookieHeader) return NO_TOKEN;

	const config = getConfig();
	const cookies = parseCookies(cookieHeader);
	const accessToken = cookies[config.security.authCookieName];
	if (!accessToken) return NO_TOKEN;

	const decoded = jwt.decode(accessToken) as { exp?: number; iat?: number } | null;
	const tokenIssuedAt = decoded?.iat ? new Date(decoded.iat * 1000) : undefined;
	const tokenExpiresAt = decoded?.exp ? decoded.exp * 1000 : undefined;

	return { accessTokenHash: hashToken(accessToken), tokenExpiresAt, tokenIssuedAt };
}

/**
 * Whether a message-driven check can skip the account lookups because the last full check is
 * recent. The periodic timer never asks: it passes `force`, so a message shortly before a tick
 * can't push the next full check a whole period later (ASSERT-042). A connection never validated
 * is not recent, so its first message-driven check runs in full.
 */
function recentlyValidated(ctx: WsContext, now: number): boolean {
	return (
		ctx.lastValidatedAt !== undefined &&
		now - ctx.lastValidatedAt <= WS_REVALIDATION_INTERVAL_MS - WS_REVALIDATION_JITTER_MS
	);
}

/**
 * Revalidate JWT expiry, account status, blanket token revocation, and revocation of the
 * individual token the socket was opened with.
 *
 * @param ws - The socket to close when the connection is no longer valid
 * @param ctx - The connection's context
 * @param force - True from the periodic timer, which always runs the full check; message-driven
 *   checks leave it false and are throttled to once per interval minus jitter
 * @returns False when the socket was closed
 */
function revalidateConnection(
	ws: { close: (code?: number, reason?: string) => void },
	ctx: WsContext,
	force = false,
): boolean {
	const now = Date.now();

	if (ctx.tokenExpiresAt && now > ctx.tokenExpiresAt) {
		logger.debug({ connId: ctx.connId, userId: ctx.userId }, 'WebSocket: JWT expired, closing');
		ws.close(1008, 'Token expired');
		return false;
	}

	if (!force && recentlyValidated(ctx, now)) return true;

	ctx.lastValidatedAt = now;

	if (ctx.userId) {
		const userRecord = getUserAccountStatus(ctx.userId);
		if (!userRecord || userRecord.isDeleted) {
			logger.debug(
				{ connId: ctx.connId, userId: ctx.userId },
				'WebSocket: user deleted, closing',
			);
			ws.close(1008, 'Account deleted');
			return false;
		}
		if (userRecord.lockedUntil && userRecord.lockedUntil > new Date()) {
			logger.debug(
				{ connId: ctx.connId, userId: ctx.userId },
				'WebSocket: user locked, closing',
			);
			ws.close(1008, 'Account locked');
			return false;
		}
	}

	if (
		ctx.userId &&
		ctx.tokenIssuedAt &&
		isUserTokensRevokedAfter(ctx.userId, ctx.tokenIssuedAt)
	) {
		logger.debug(
			{ connId: ctx.connId, userId: ctx.userId },
			'WebSocket: token revoked, closing',
		);
		ws.close(1008, 'Token revoked');
		return false;
	}

	// The token this socket was opened with, revoked on its own (a logout in the browser that
	// holds it). Without this, a copied token's socket outlived the logout until token expiry.
	if (ctx.accessTokenHash && isTokenHashRevoked(ctx.accessTokenHash)) {
		logger.debug(
			{ connId: ctx.connId, userId: ctx.userId },
			'WebSocket: access token revoked, closing',
		);
		ws.close(1008, 'Token revoked');
		return false;
	}

	return true;
}

export { extractTokenState, revalidateConnection };

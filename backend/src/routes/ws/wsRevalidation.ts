import jwt from 'jsonwebtoken';

import { getConfig } from '../../config/configLoader.ts';
import { parseCookies } from '../../plugins/auth.ts';
import { getUserAccountStatus } from '../../services/userService.ts';
import { isUserTokensRevokedAfter } from '../../utils/auth/tokenBlacklist.ts';
import { logger } from '../../utils/logger.ts';
import {
	WS_REVALIDATION_INTERVAL_MS,
	WS_REVALIDATION_JITTER_MS,
	type WsContext,
} from './wsAuth.ts';

function extractTokenTimestamps(cookieHeader: null | string): {
	tokenExpiresAt: number | undefined;
	tokenIssuedAt: Date | undefined;
} {
	if (!cookieHeader) return { tokenExpiresAt: undefined, tokenIssuedAt: undefined };

	const config = getConfig();
	const cookies = parseCookies(cookieHeader);
	const accessToken = cookies[config.security.authCookieName];
	if (!accessToken) return { tokenExpiresAt: undefined, tokenIssuedAt: undefined };

	const decoded = jwt.decode(accessToken) as { exp?: number; iat?: number } | null;
	const tokenIssuedAt = decoded?.iat ? new Date(decoded.iat * 1000) : undefined;
	const tokenExpiresAt = decoded?.exp ? decoded.exp * 1000 : undefined;

	return { tokenExpiresAt, tokenIssuedAt };
}

/** Revalidate JWT expiry, account status, and blanket token revocation. */
function revalidateConnection(
	ws: { close: (code?: number, reason?: string) => void },
	ctx: WsContext
): boolean {
	const now = Date.now();

	if (ctx.tokenExpiresAt && now > ctx.tokenExpiresAt) {
		logger.debug({ connId: ctx.connId, userId: ctx.userId }, 'WebSocket: JWT expired, closing');
		ws.close(1008, 'Token expired');
		return false;
	}

	// The timer fires no later than interval - jitter, preserving the two-minute ceiling.
	if (
		!ctx.lastValidatedAt ||
		now - ctx.lastValidatedAt <= WS_REVALIDATION_INTERVAL_MS - WS_REVALIDATION_JITTER_MS
	) {
		return true;
	}

	ctx.lastValidatedAt = now;

	if (ctx.userId) {
		const userRecord = getUserAccountStatus(ctx.userId);
		if (!userRecord || userRecord.isDeleted) {
			logger.debug(
				{ connId: ctx.connId, userId: ctx.userId },
				'WebSocket: user deleted, closing'
			);
			ws.close(1008, 'Account deleted');
			return false;
		}
		if (userRecord.lockedUntil && userRecord.lockedUntil > new Date()) {
			logger.debug(
				{ connId: ctx.connId, userId: ctx.userId },
				'WebSocket: user locked, closing'
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
			'WebSocket: token revoked, closing'
		);
		ws.close(1008, 'Token revoked');
		return false;
	}

	return true;
}

export { extractTokenTimestamps, revalidateConnection };

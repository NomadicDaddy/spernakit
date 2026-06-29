import jwt from 'jsonwebtoken';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { parseCookies } from '../../plugins/auth.ts';
import { getUserAccountStatus } from '../../services/userService.ts';
import {
	WS_MESSAGE_TYPES,
	cleanupConnection,
	getConnection,
	handleSubscribe,
	handleUnsubscribe,
	nextConnectionId,
	preprocessMessage,
	registerConnection,
	type TrackedConnection,
} from '../../services/websocketService.ts';
import { isUserTokensRevokedAfter } from '../../utils/auth/tokenBlacklist.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import { logger } from '../../utils/logger.ts';
import { isOriginAllowed } from '../../utils/originValidation.ts';
import { checkConnectionLimits } from './rate-limit.ts';
import {
	authenticateFromCookies,
	getWsContext,
	WS_REVALIDATION_INTERVAL_MS,
	type WsContext,
} from './wsAuth.ts';

/** Extract iat/exp timestamps from a JWT in the cookie header. */
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

/**
 * Periodic re-validation: check JWT expiry, user deletion/lockout, and token blanket-revocation.
 * Returns true if the connection is still valid, false if it was closed.
 */
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

	if (!ctx.lastValidatedAt || now - ctx.lastValidatedAt <= WS_REVALIDATION_INTERVAL_MS) {
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

/** Handle WebSocket connection close: clean up tracking. */
function handleClose(ws: { data: unknown }): void {
	const wsContext = getWsContext(ws);
	const { connId, revalTimer } = wsContext;
	if (revalTimer) {
		clearInterval(revalTimer);
		delete wsContext.revalTimer;
	}
	if (connId) {
		const conn = getConnection(connId);
		if (conn) {
			logger.debug({ connId, userId: conn.user.id }, 'WebSocket connection closed');
		}
		cleanupConnection(connId);
	}
}

/** Handle incoming WebSocket message: re-validate auth, route ping/subscribe/unsubscribe. */
function handleMessage(
	ws: {
		close: (code?: number, reason?: string) => void;
		data: unknown;
		send: (data: string) => void;
		subscribe: (channel: string) => void;
		unsubscribe: (channel: string) => void;
	},
	rawMessage: string
): void {
	const ctx = getWsContext(ws);
	const { connId } = ctx;
	if (!connId) return;

	if (!revalidateConnection(ws, ctx)) return;

	const msg = preprocessMessage(connId, rawMessage);
	if (!msg) return;

	const conn = getConnection(connId);

	switch (msg.type) {
		case WS_MESSAGE_TYPES.ping:
			ws.send(JSON.stringify({ type: 'pong' }));
			break;
		case WS_MESSAGE_TYPES.subscribe:
			handleSubscribe(ws, conn, connId, msg.channel);
			break;
		case WS_MESSAGE_TYPES.unsubscribe:
			handleUnsubscribe(ws, conn, connId, msg.channel);
			break;
	}
}

/** Handle WebSocket connection open: register, auto-subscribe to user channel. */
function handleOpen(ws: {
	data: unknown;
	raw: { close: (code?: number, reason?: string) => void; send: (data: string) => void };
	send: (data: string) => void;
	subscribe: (topic: string) => void;
}): void {
	const wsContext = getWsContext(ws);
	const { wsUser: user } = wsContext;
	if (!user) {
		ws.raw.close();
		return;
	}

	const connId = nextConnectionId();
	wsContext.connId = connId;
	wsContext.userId = user.id;

	const rawWs = ws.raw;
	const tracked: TrackedConnection = {
		channels: new Set<string>(),
		clientIp: wsContext.clientIp ?? '',
		close: () => rawWs.close(),
		send: (str: string) => {
			rawWs.send(str);
		},
		user,
	};

	registerConnection(connId, tracked);

	// Arm periodic revalidation so idle connections still re-verify JWT/user state on the
	// framework cadence. Jitter spreads timer fires across connections to avoid thundering
	// herd (all connections would otherwise align on the 2-minute grid when started at boot).
	const revalTimer = setInterval(
		() => {
			const stillValid = revalidateConnection(
				{ close: (code, reason) => rawWs.close(code, reason) },
				wsContext
			);
			if (!stillValid) {
				clearInterval(revalTimer);
				delete wsContext.revalTimer;
			}
		},
		WS_REVALIDATION_INTERVAL_MS + Math.floor(Math.random() * 30_000)
	);
	wsContext.revalTimer = revalTimer;

	// Auto-subscribe to user channel via Bun's native pub/sub
	const userChannel = `user:${user.id}`;
	ws.subscribe(userChannel);
	tracked.channels.add(userChannel);

	logger.debug({ connId, userId: user.id }, 'WebSocket connection established');

	// Send welcome message
	ws.send(
		JSON.stringify({
			data: {
				channels: [userChannel],
				userId: user.id,
			},
			type: 'connected',
		})
	);
}

/**
 * Handle WebSocket upgrade: validate origin, authenticate, check limits.
 * Returns WsContext data on success or error string on failure.
 */
function handleUpgrade({
	request,
	set,
}: {
	request: Request;
	set: { status?: number | string };
}): Record<string, unknown> | string {
	const config = getConfig();

	// Validate Origin header for CSRF protection
	const origin = request.headers.get('origin');
	if (!isOriginAllowed(origin, config)) {
		logger.debug({ origin }, 'WebSocket upgrade rejected: origin not allowed');
		set.status = HTTP_STATUS.FORBIDDEN;
		return 'Forbidden';
	}

	// Authenticate user
	const user = authenticateFromCookies(request.headers.get('cookie'));
	if (!user) {
		logger.debug('WebSocket upgrade rejected: not authenticated');
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return 'Unauthorized';
	}

	// Check connection limits
	const clientIp = getClientIp(request);
	const limitError = checkConnectionLimits(clientIp, user.id, config, set);
	if (limitError) return limitError;

	// Extract token iat/exp for re-validation and blanket-revocation checks.
	const { tokenExpiresAt, tokenIssuedAt } = extractTokenTimestamps(request.headers.get('cookie'));

	return {
		clientIp,
		lastValidatedAt: Date.now(),
		tokenExpiresAt,
		tokenIssuedAt,
		userId: user.id,
		wsUser: user,
	};
}

export { handleClose, handleMessage, handleOpen, handleUpgrade };

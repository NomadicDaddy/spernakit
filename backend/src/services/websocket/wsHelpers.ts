import { randomUUID } from 'node:crypto';

import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { hasMinimumRole } from '../../types/roles.ts';
import { logger } from '../../utils/logger.ts';
import { isWorkspaceMember } from '../workspaceService.ts';
import { connectionMessageTimestamps, sendToConnection } from './wsBroadcast.ts';

/** WebSocket incoming message type values. */
export const WS_MESSAGE_TYPES = {
	ping: 'ping',
	subscribe: 'subscribe',
	unsubscribe: 'unsubscribe',
} as const;

type WsMessageType = (typeof WS_MESSAGE_TYPES)[keyof typeof WS_MESSAGE_TYPES];

export interface WsIncomingMessage {
	channel?: string | undefined;
	type: WsMessageType;
}

/** Valid channel patterns: user:{numeric_id} or workspace:{numeric_id}. */
const CHANNEL_PATTERN = /^(user|workspace):(\d+)$/;

/** Maximum messages per connection within a rate limit window. */
const WS_RATE_LIMIT_MAX = 60;

/** Maximum channel name length. */
const WS_MAX_CHANNEL_LENGTH = 100;

/**
 * Get rate limit window from config (defaults to 60000ms).
 * Reads from config.websocket.rateLimitWindow.
 * @returns Rate limit window in milliseconds
 */
export function getRateLimitWindowMs(): number {
	return getConfig().websocket.rateLimitWindow;
}

/**
 * Get maximum message payload size from config (defaults to 1MB).
 * Reads from config.websocket.maxPayload.
 * @returns Maximum payload size in bytes
 */
export function getMaxPayloadSize(): number {
	return getConfig().websocket.maxPayload;
}

/**
 * Validate an incoming WebSocket message against expected structure.
 * @param data
 * @returns Validated message or null if invalid
 */
export function validateWsMessage(data: unknown): null | WsIncomingMessage {
	if (typeof data !== 'object' || data === null) return null;

	const msg = data as Record<string, unknown>;

	// Validate type field
	if (
		msg.type !== WS_MESSAGE_TYPES.ping &&
		msg.type !== WS_MESSAGE_TYPES.subscribe &&
		msg.type !== WS_MESSAGE_TYPES.unsubscribe
	) {
		return null;
	}

	// Validate channel field if present
	if (msg.channel !== undefined) {
		if (typeof msg.channel !== 'string' || msg.channel.length > WS_MAX_CHANNEL_LENGTH) {
			return null;
		}
	}

	return {
		channel: typeof msg.channel === 'string' ? msg.channel : undefined,
		type: msg.type as WsMessageType,
	};
}

/**
 * Check whether a connection has exceeded message rate limit.
 * @param connId
 * @returns True if rate limited
 */
export function isRateLimited(connId: string): boolean {
	const now = Date.now();
	const rateLimitWindowMs = getRateLimitWindowMs();
	const windowStart = now - rateLimitWindowMs;

	let timestamps = connectionMessageTimestamps.get(connId);
	if (!timestamps) {
		timestamps = [];
		connectionMessageTimestamps.set(connId, timestamps);
	}

	// Prune timestamps outside of window
	const pruneIdx = timestamps.findIndex((t) => t > windowStart);
	if (pruneIdx > 0) {
		timestamps.splice(0, pruneIdx);
	} else if (pruneIdx === -1) {
		timestamps.length = 0;
	}

	if (timestamps.length >= WS_RATE_LIMIT_MAX) {
		return true;
	}

	timestamps.push(now);
	return false;
}

/**
 * Validate that a channel name matches an allowed pattern.
 * @param channel
 * @returns True if channel name is valid
 */
export function isValidChannel(channel: string): boolean {
	return CHANNEL_PATTERN.test(channel);
}

/**
 * Check if a user is authorized to subscribe to a given channel.
 * Users can subscribe to their own user channel and any workspace they belong to.
 * @param user
 * @param channel
 * @returns True if the user is authorized for the channel
 */
export function isAuthorizedForChannel(user: AuthPayload, channel: string): boolean {
	const match = CHANNEL_PATTERN.exec(channel);
	if (!match) return false;

	const [, type, idStr] = match;
	const id = Number(idStr);

	if (type === 'user') {
		return id === user.id;
	}

	if (type === 'workspace') {
		if (hasMinimumRole(user.role, 'SYSOP')) return true;
		return isWorkspaceMember(id, user.id);
	}

	return false;
}

/**
 * Generate a unique connection ID using crypto-safe random UUID.
 * @returns Unique connection ID string
 */
export function nextConnectionId(): string {
	return `ws-${randomUUID()}`;
}

/**
 * Preprocess raw WebSocket message: check size, rate limit, parse JSON, validate structure.
 * @param connId
 * @param rawMessage
 * @returns Validated message or null if preprocessing failed
 */
export function preprocessMessage(connId: string, rawMessage: unknown): null | WsIncomingMessage {
	const maxPayloadSize = getMaxPayloadSize();
	const messageStr = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);
	if (messageStr.length > maxPayloadSize) {
		sendToConnection(connId, { data: 'Message too large', type: 'error' });
		logger.warn({ connId, size: messageStr.length }, 'WebSocket message size exceeded');
		return null;
	}

	if (isRateLimited(connId)) {
		sendToConnection(connId, { data: 'Rate limit exceeded', type: 'error' });
		logger.warn({ connId }, 'WebSocket message rate limit exceeded');
		return null;
	}

	let parsed: unknown;
	try {
		parsed = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
	} catch {
		sendToConnection(connId, { data: 'Invalid JSON format', type: 'error' });
		return null;
	}

	const msg = validateWsMessage(parsed);
	if (!msg) {
		sendToConnection(connId, { data: 'Invalid message structure', type: 'error' });
		logger.warn({ connId }, 'WebSocket message validation failed');
		return null;
	}

	return msg;
}

/**
 * Handle a subscribe request: validate channel, check authorization, subscribe.
 * @param ws
 * @param ws.subscribe
 * @param conn
 * @param connId
 * @param channel
 */
export function handleSubscribe(
	ws: { subscribe(channel: string): void },
	conn: { channels: Set<string>; user: AuthPayload } | undefined,
	connId: string,
	channel: string | undefined
): void {
	if (!channel) {
		sendToConnection(connId, { data: 'Missing channel', type: 'error' });
		return;
	}
	if (!isValidChannel(channel)) {
		sendToConnection(connId, { data: 'Invalid channel format', type: 'error' });
		logger.warn({ connId }, 'WebSocket subscribe with invalid channel format');
		return;
	}
	if (!conn) {
		// Fail closed: no tracked connection means no verified user context
		sendToConnection(connId, { data: 'Not authorized for channel', type: 'error' });
		logger.warn({ connId }, 'Subscribe attempt without tracked connection');
		return;
	}
	if (!isAuthorizedForChannel(conn.user, channel)) {
		sendToConnection(connId, { data: 'Not authorized for channel', type: 'error' });
		logger.warn({ connId, userId: conn.user.id }, 'Unauthorized channel subscription attempt');
		return;
	}
	ws.subscribe(channel);
	conn.channels.add(channel);
	sendToConnection(connId, { channel, type: 'subscribed' });
	logger.debug({ channel, connId }, 'Subscribed to channel');
}

/**
 * Handle an unsubscribe request.
 * @param ws
 * @param ws.unsubscribe
 * @param conn
 * @param connId
 * @param channel
 */
export function handleUnsubscribe(
	ws: { unsubscribe(channel: string): void },
	conn: { channels: Set<string> } | undefined,
	connId: string,
	channel: string | undefined
): void {
	if (channel && isValidChannel(channel)) {
		ws.unsubscribe(channel);
		conn?.channels.delete(channel);
		sendToConnection(connId, { channel, type: 'unsubscribed' });
		logger.debug({ channel, connId }, 'Unsubscribed from channel');
	}
}

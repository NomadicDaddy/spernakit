import type { WsCrudEvent } from 'spernakit-shared';

import type { AuthPayload } from '../../plugins/auth.ts';

import { ROLE_HIERARCHY } from '../../types/roles.ts';
import { logger } from '../../utils/logger.ts';
import { getBunServer, setBunServer } from '../../utils/serverRef.ts';

/**
 * Message types server can send to clients.
 */
interface WsOutgoingMessage {
	channel?: string;
	data?: unknown;
	type: string;
}

/**
 * A tracked WebSocket connection with user context.
 */
export interface TrackedConnection {
	channels: Set<string>;
	clientIp: string;
	close: () => void;
	send: (data: string) => void;
	user: AuthPayload;
}

/** All active connections keyed by a unique connection ID. */
const connections = new Map<string, TrackedConnection>();

/** Per-connection message timestamps for rate limiting. */
export const connectionMessageTimestamps = new Map<string, number[]>();

export { setBunServer };

/**
 * Register a tracked connection for broadcasting.
 * @param connId
 * @param connection
 */
export function registerConnection(connId: string, connection: TrackedConnection): void {
	connections.set(connId, connection);
}

/**
 * Get a connection by ID.
 * @param connId
 * @returns The tracked connection, or undefined if not found
 */
export function getConnection(connId: string): TrackedConnection | undefined {
	return connections.get(connId);
}

/**
 * Clean up all subscriptions for a connection.
 * @param connId
 */
export function cleanupConnection(connId: string): void {
	const conn = connections.get(connId);
	if (!conn) return;

	connections.delete(connId);
	connectionMessageTimestamps.delete(connId);
}

/**
 * Send a JSON message to a specific connection via raw Bun WebSocket.
 * @param connId
 * @param message
 */
export function sendToConnection(connId: string, message: WsOutgoingMessage): void {
	const conn = connections.get(connId);
	if (!conn) return;

	try {
		conn.send(JSON.stringify(message));
	} catch {
		logger.warn({ connId }, 'Failed to send WebSocket message, cleaning up connection');
		cleanupConnection(connId);
	}
}

/**
 * Broadcast a message only to connections where user has ADMIN+ role.
 * ADMIN role level is 4 in ROLE_HIERARCHY.
 * @param message
 */
export function broadcastToAdmins(message: WsOutgoingMessage): void {
	const payload = JSON.stringify(message);
	const adminLevel = ROLE_HIERARCHY.ADMIN;

	const snapshot = Array.from(connections.entries());
	for (const [connId, conn] of snapshot) {
		const userLevel = ROLE_HIERARCHY[conn.user.role] ?? 0;
		if (userLevel < adminLevel) continue;

		try {
			conn.send(payload);
		} catch {
			logger.warn({ connId }, 'Failed to broadcast to admin, cleaning up connection');
			cleanupConnection(connId);
		}
	}
}

/**
 * Send a message to all connections for a specific user.
 * @param userId
 * @param message
 */
export function broadcastToUser(userId: number, message: WsOutgoingMessage): void {
	const channel = `user:${userId}`;
	broadcastToChannel(channel, message);
}

/**
 * Send a message to all connections subscribed to a specific channel.
 * Uses Bun's native topic-based pub/sub via server.publish().
 * @param channel
 * @param message
 */
export function broadcastToChannel(channel: string, message: WsOutgoingMessage): void {
	const server = getBunServer();
	if (!server) {
		logger.warn('Cannot broadcast: Bun server reference not set');
		return;
	}

	const payload = JSON.stringify({ ...message, channel });
	server.publish(channel, payload);
}

/**
 * Get the count of active WebSocket connections.
 * @returns Number of active connections
 */
export function getConnectionCount(): number {
	return connections.size;
}

/**
 * Count active connections grouped by user ID.
 * Used by rate-limit reconciliation to detect counter drift.
 * @returns Map of userId to connection count
 */
export function getConnectionCountsByUser(): Map<number, number> {
	const counts = new Map<number, number>();
	for (const conn of connections.values()) {
		counts.set(conn.user.id, (counts.get(conn.user.id) ?? 0) + 1);
	}
	return counts;
}

/**
 * Count active connections grouped by client IP.
 * Used by rate limiting to derive per-IP counts from live connections,
 * preventing counter drift when connections abort between upgrade and open.
 * @returns Map of client IP to connection count
 */
export function getConnectionCountsByIp(): Map<string, number> {
	const counts = new Map<string, number>();
	for (const conn of connections.values()) {
		counts.set(conn.clientIp, (counts.get(conn.clientIp) ?? 0) + 1);
	}
	return counts;
}

/**
 * Close all active WebSocket connections and clear the tracking maps.
 * Used during graceful shutdown to notify clients before the server stops.
 */
export function closeAllConnections(): void {
	for (const [connId, conn] of Array.from(connections.entries())) {
		try {
			conn.close();
		} catch {
			logger.warn({ connId }, 'Failed to close WebSocket connection during shutdown');
		}
	}
	connections.clear();
	connectionMessageTimestamps.clear();
}

/**
 * Broadcast a CRUD event to a specific user's channel.
 *
 * Used when the modified resource is user-scoped (e.g., dashboards).
 *
 * @param userId - Target user to notify
 * @param event - Canonical CRUD event from WS_CRUD_EVENTS (shared with frontend)
 * @param data - Optional payload (typically the resource ID)
 */
export function broadcastCrudToUser(
	userId: number,
	event: WsCrudEvent,
	data?: Record<string, unknown>
): void {
	broadcastToUser(userId, {
		data: data ?? {},
		type: event,
	});
}

/**
 * Broadcast a CRUD event to all members of a workspace channel.
 *
 * Used when the modified resource is workspace-scoped (e.g., files, workspace members).
 * Requires clients to be subscribed to the `workspace:{id}` channel.
 *
 * @param workspaceId - Target workspace channel
 * @param event - Canonical CRUD event from WS_CRUD_EVENTS (shared with frontend)
 * @param data - Optional payload (typically the resource ID)
 */
export function broadcastCrudToWorkspace(
	workspaceId: number,
	event: WsCrudEvent,
	data?: Record<string, unknown>
): void {
	broadcastToChannel(`workspace:${workspaceId}`, {
		data: data ?? {},
		type: event,
	});
}

/**
 * Broadcast a CRUD event to all admin-level users.
 *
 * Used when the modified resource is globally visible to admins
 * (e.g., user management, settings, health alerts).
 *
 * @param event - Canonical CRUD event from WS_CRUD_EVENTS (shared with frontend)
 * @param data - Optional payload (typically the resource ID)
 */
export function broadcastCrudToAdmins(event: WsCrudEvent, data?: Record<string, unknown>): void {
	broadcastToAdmins({
		data: data ?? {},
		type: event,
	});
}

/** Dashboard update data structure for WebSocket broadcast. */
export interface DashboardUpdateData {
	auditEvents: number;
	metrics: {
		activeConnections: number;
		cpuUsage: number;
		memoryUsage: number;
		requestCount: number;
	};
	systemHealth: string;
	totalUsers: number;
	unreadNotifications?: number;
}

/**
 * Broadcast a dashboard update to ADMIN+ users only.
 * Dashboard data contains system metrics that should only be visible to admins.
 * @param data
 */
export function broadcastDashboardUpdate(data: DashboardUpdateData): void {
	broadcastToAdmins({
		data,
		type: 'dashboard-update',
	});
}

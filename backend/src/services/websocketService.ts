/**
 * WebSocket Service — Facade.
 *
 * Re-exports public API from the websocket/ subdirectory.
 * No business logic belongs in this file.
 */
export {
	broadcastCrudToAdmins,
	broadcastCrudToUser,
	broadcastCrudToWorkspace,
	broadcastDashboardUpdate,
	broadcastToAdmins,
	broadcastToChannel,
	broadcastToUser,
	cleanupConnection,
	closeAllConnections,
	connectionMessageTimestamps,
	getConnection,
	getConnectionCount,
	getConnectionCountsByUser,
	registerConnection,
	sendToConnection,
	setBunServer,
} from './websocket/wsBroadcast.ts';
export type { DashboardUpdateData, TrackedConnection } from './websocket/wsBroadcast.ts';
export {
	getRateLimitWindowMs,
	getMaxPayloadSize,
	handleSubscribe,
	handleUnsubscribe,
	isAuthorizedForChannel,
	isRateLimited,
	isValidChannel,
	nextConnectionId,
	preprocessMessage,
	validateWsMessage,
	WS_MESSAGE_TYPES,
} from './websocket/wsHelpers.ts';
export type { WsIncomingMessage } from './websocket/wsHelpers.ts';
